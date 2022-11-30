import * as fs from 'fs';
import { fatalError, base64toImage, deleteOutput } from './utils.js';
import { generateEpub  } from './epubgen.js';
import inquirer from 'inquirer';
import { LocalStorage } from 'node-localstorage';
import sanitize from 'sanitize-filename';
import imgToPDF from 'image-to-pdf';
import * as path from 'path';
import fetch from 'node-fetch';

import { Builder, Browser, By, Key, until } from 'selenium-webdriver';

const localStorage = new LocalStorage('./localstorage');

console.log(`CrunchyManga 1.0 by TomcatMWI - A handy utility to save mangas on your device!`);

//  Query parameters

  const browserChoices = ['Chrome', 'Firefox', 'Edge', 'Opera'];
  const formatChoices = ['Images - each page is a JPEG file', 'PDF file', 'EPUB file']
  const overwriteChoices = ['Delete old download and start over', 'Download new images only (resume interrupted download)', 'Skip downloading entirely'];

  const params = await inquirer.prompt([
  {
    type: 'input',
    name: 'username',
    default: localStorage.getItem('crunchyroll_username'),
    message: 'Enter your Crunchyroll username:',
    validate(value) {
      if (value.length > 3)
        return true
      throw Error('This doesn\'t seem to be a valid username.');
    }
  },
  {
    type: 'password',
    name: 'password',
    default: localStorage.getItem('crunchyroll_password') || null,
    message: `Enter your Crunchyroll password ${localStorage.getItem('crunchyroll_password') ? '(press Enter to use saved password)' : ''}:`,
    validate(value) {
      if (value.length > 3)
        return true
      throw Error('This doesn\'t seem to be a valid password.');
    }
  },
  {
    type: 'input',
    name: 'url',
    message: 'Enter URL of the starting volume of the Crunchyroll manga:',
    default: localStorage.getItem('crunchyroll_url'),
    validate(value) {
      if ((/^https:\/\/(www\.)?crunchyroll.com\/manga\/(.*)\/read\/(\d+)$/ig).test(value))
        return true
      throw Error('Invalid URL. Example: https://crunchyroll.com/manga/MANGA_TITLE/read/1');
    }
  },  
  {
      type: 'rawlist',
      name: 'browser',
      message: 'Which browser shall we use?',
      default: localStorage.getItem('crunchyroll_browser'),
      choices: browserChoices
  },
  {
      type: 'rawlist',
      name: 'format',
      message: 'How shall we save the manga?',
      default: localStorage.getItem('crunchyroll_format'),
      choices: formatChoices
  },
  {
      type: 'rawlist',
      name: 'pdf_pagesize',
      message: 'PDF page size?',
      default: localStorage.getItem('crunchyroll_pdf_pagesize') || 'LETTER',
      choices: Object.keys(imgToPDF.sizes),
      when: answers => {
        console.log(JSON.stringify(answers, null, 2));
        return answers.format === formatChoices[1]
      }
  },
  {
      type: 'rawlist',
      name: 'overwrite',
      message: 'What to do if a previous download exists?',
      default: localStorage.getItem('crunchyroll_overwrite'),
      choices: overwriteChoices
  },
  {
      type: 'rawlist',
      name: 'consent',
      message: 'Go ahead with the above settings?',
      choices: ['Yes', 'No']
  }
  ]).catch(err => fatalError(err.message));

  if (params.consent === 'No')
    fatalError('User abort! Maybe next time...');

  localStorage.setItem('crunchyroll_username', params.username);
  localStorage.setItem('crunchyroll_password', params.password);
  localStorage.setItem('crunchyroll_url', params.url);
  localStorage.setItem('crunchyroll_browser', params.browser);
  localStorage.setItem('crunchyroll_format', params.format);
  localStorage.setItem('crunchyroll_pdf_pagesize', params.pdf_pagesize || 'LETTER');
  localStorage.setItem('crunchyroll_overwrite', params.overwrite);

//  Launch browser and navigate to Crunchyroll

let browser = [Browser.CHROME, Browser.FIREFOX, Browser.EDGE, Browser.OPERA][browserChoices.findIndex(x => x === params.browser)];

(async () => {
  try {

    //  Load Crunchyroll
    const driver = await new Builder().forBrowser(browser).build();
    await driver.get('https://crunchyroll.com');

    //  Click user profile icon
    const profileButton = By.xpath(`/html/body/div[1]/div/div[1]/div[1]/div[3]/ul/li[4]/div/div[1]`);
    await driver.wait(until.elementLocated(profileButton));
    await driver.findElement(profileButton).click();

    //  Click login link
    const loginLink = By.xpath(`//h5[contains(text(), 'Log In')]`);
    await driver.wait(until.elementLocated(loginLink));
    await driver.findElement(loginLink).click();

    //  Click 'Reject all non-essential cookies'
    const cookieButton = By.id('_evidon-decline-button');
    await driver.wait(until.elementLocated(cookieButton));
    await driver.findElement(cookieButton).click();

    //  Type in username and password, then click LOG IN
    const usernameField = By.xpath(`//input[@name='username']`);
    const passwordField = By.xpath(`//input[@name='password']`);
    await driver.wait(until.elementLocated(usernameField));
    await driver.wait(until.elementLocated(passwordField));
    await driver.findElement(usernameField).sendKeys(params.username);
    await driver.findElement(passwordField).sendKeys(params.password);
    await driver.findElement(By.xpath(`//button[contains(text(), 'LOG IN')]`)).click();

    //  Wait for main page to load, then go to manga
    await driver.wait(until.elementLocated(By.xpath(`//span[contains(text(), 'Log Out')]`)));
    await driver.wait(until.elementLocated(cookieButton));
    await driver.findElement(cookieButton).click();

    //  Go to manga main page and get author info
    const mangaMain = params.url
      .replace(/\/manga\//g, '/comics/manga/')
      .replace(/\/read(.*)/g, '/volumes');

    console.log('Getting manga data...');
    await driver.get(mangaMain);
    await driver.wait(until.elementLocated(By.xpath(`//h3[contains(text(), 'More Information')]`)));

    const mangaInfo = {
      publisher: '',
      firstPublished: '',
      author: '',
      artist: '',
      copyright: '',
      translator: '',
      editor: '',
      letterer: '',
      title: ''
    }

    let mangaTitle = await driver.findElement(By.xpath("//meta[@name='title']")).getAttribute("content");
    mangaInfo.title = mangaTitle.replace(/ - Crunchyroll/g, '');

    const infoLines = await driver.findElements(By.xpath(`/html/body/div[2]/div/div[1]/div[3]/div/div[3]/ul/li[3]/ul/li`));
    for (const [index, line] of infoLines.entries()) {
      const dataLine = await line.getAttribute('innerHTML');
      mangaInfo[Object.keys(mangaInfo)[index]] = dataLine.replace(/<(.*)>/gi, "").trim();
    }

    console.log(`Manga title: "${mangaInfo.title}"`);

    //  Save cover image (later for the EPUB)
    const coverXpath = By.xpath(`//img[contains(@class, 'poster')]`);
    await driver.wait(until.elementLocated(coverXpath));
    const coverImage = await driver.findElement(coverXpath).getAttribute('src');

    //  Create save directory
    const outDir = path.join(process.cwd(), 'output', sanitize(mangaInfo.title));
    console.log(`Output directory: "${outDir}"`);

    let skipDownload = false;

    if (fs.existsSync(outDir))
      switch(params.overwrite) {
        case overwriteChoices[0]:
          deleteOutput(outDir);
          break;
        case overwriteChoices[2]:
          skipDownload = true;
          break;
      }
    else
      fs.mkdirSync(outDir);    

    const getCurrentChapter = async () => {

        console.log(`Downloading chapter ${mangaChapter}...`);

        //  Pull bar to page 1
        const barXpath = By.xpath(`/html/body/div[2]/div/div[1]/section/div/article/header/div/input`);
        await driver.wait(until.elementLocated(barXpath), 20000);
        const bar = await driver.findElement(barXpath);
        await bar.click();
        await driver.sleep(3000);
        await bar.sendKeys(Key.HOME);
        await driver.sleep(3000);

        //  Start from page 1
        let page = 1;
        const imageXpath = By.xpath(`//ol/li`);
        await driver.wait(until.elementsLocated(imageXpath), 5000);
        const images = await driver.findElements(imageXpath);

        console.log(`Found ${images.length} pages.`);

        const getCurrentPages = async () => {
          console.log(`Retrieving chapter ${mangaChapter}, page ${page}...`);
          const image = images[page-1];

            //  Wait until the image has a background-image tag
            await driver.wait(
              (async () => await image.getCssValue('background-image') !== 'none'), 10000
            );

            const background = await image.getCssValue('background-image');

            if (background !== 'none') {
                base64toImage(background, path.join(outDir, `ch${String(mangaChapter).padStart(3, '0')}_p${String(page).padStart(3, '0')}.jpg`));
                page++;

                if (page === 1 || page % 2 !== 0) {
                  console.log('Clicking button, going to page: ' + page);
                  const btnPath = By.xpath(`//a[contains(@class, 'js-next-link')]`);
                  await driver.wait(until.elementLocated(btnPath));
                  const button = await driver.findElement(btnPath);
                  await button.click();
                }

                if (page <= images.length)
                  await getCurrentPages()
                else {
                    console.log(`All pages in chapter ${mangaChapter} finished!`);
                    mangaChapter++;
                    const nextUrl = params.url.match(/^https:\/\/www\.crunchyroll\.com\/manga\/(.*)\/read\//g) + String(mangaChapter);
                    console.log(`Attempting to load ${nextUrl}`);
                    await driver.get(nextUrl);
                }

            } else
              console.error(`Image in chapter ${mangaChapter} page ${page} cannot be loaded!`);
        }      

        await getCurrentPages();

        const notFound = await driver.findElements(By.xpath ("//*[contains(text(),'Page Not Found')]"), 1000);
        if (!notFound.length)
          await getCurrentChapter();
        else
          console.log('Looks like this was the last chapter!');
    }

    //  The download loop!
    
    if (!skipDownload) {

      //  Download cover image
      const coverImageResponse = await fetch(coverImage, { method: 'GET' });
      const coverImageBlob = await coverImageResponse.blob();
      fs.writeFileSync(path.join(outDir, 'cover.jpg'), Buffer.from(await coverImageBlob.arrayBuffer()), 'binary');

      //  Go to manga reader and start grabbing
      await driver.get(params.url);
      await driver.wait(until.elementLocated(By.id('manga_reader')));

      let mangaChapter = params.url.match(/(\d*)$/igm)[0];
      console.log(`Downloading manga from chapter ${mangaChapter}`);

      await getCurrentChapter();      
    }

    await driver.quit();

    //  Done - let's save it... or not...
    if (params.method === formatChoices[0]) {
      console.log('All done! Bye!');
      process.exit(0);
    }

    //  Convert downloaded images to PDF
    if (params.format === formatChoices[1]) {
      console.log('Exporting to PDF...');
      const pages =  fs.readdirSync(outDir).map(file => path.join(outDir, file));
      pages.prepend(path.join(outDir, 'cover.jpg'));
      imgToPDF(pages, imgToPDF.sizes[params.pdf_pagesize])
        .pipe(fs.createWriteStream(
          path.join(process.cwd(), 'output', sanitize(mangaInfo.title) + '.pdf')
        ));
    }

    //  Convert downloaded images to EPUB
    if (params.format === formatChoices[2]) 
      await generateEpub({
        mangaInfo,
        files: fs.readdirSync(outDir).filter(x => new RegExp(/^ch(\d{3})_p(\d{3})\.jpg/g).test(x)),
        dir: outDir,
        cover: path.join(outDir, 'cover.jpg'),
        output: path.join(process.cwd(), 'output', sanitize(mangaInfo.title) + '.epub'),
      });

    deleteOutput(outDir, true);
    console.log('All done! Bye!');

  } catch(err) {
    if (typeof driver !== 'undefined')
      await driver.quit();
    fatalError(err.message);
  } finally {
    console.log('Process completed!')
  }
  
})();
