import * as fs from 'fs';
import { fatalError, base64toImage, deleteOutput, dump, loadUrl } from './utils.js';
import inquirer from 'inquirer';
import { LocalStorage } from 'node-localstorage';
import sanitize from 'sanitize-filename';
import imgToPDF from 'image-to-pdf';
import * as path from 'path';
import fetch from 'node-fetch';
import * as jimp from 'jimp';
import Epub from 'epub-gen';

import { Builder, Browser, By, Key, until } from 'selenium-webdriver';

const localStorage = new LocalStorage('./localstorage');

console.log(`CrunchyManga 1.0 by TomcatMWI - A handy utility to save mangas on your device!`);

//  Query parameters

  const browserChoices = ['Chrome', 'Firefox', 'Edge', 'Opera'];
  const formatChoices = ['Images - each page is a JPEG file', 'PDF file', 'EPUB file', 'Both PDF and EPUB'];
  const divideChaptersChoices = ['Single file', 'Every 20 chapters into a new file', 'Every 10 chapters into a new file', 'Every 5 chapters into a new file', 'Every single chapter into a new file'];

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
      type: 'rawlist',
      name: 'resume',
      message: 'There seems to be an interrupted download. Would you like to resume it?',
      default: localStorage.getItem('crunchyroll_divideChapters'),
      choices: ['Yes', 'No'],
      when: () => fs.existsSync(path.join(process.cwd(), 'output', 'resume.json'))
  },
  {
    type: 'input',
    name: 'url',
    message: 'Enter URL of the Crunchyroll manga:',
    default: localStorage.getItem('crunchyroll_url'),
    validate(value) {
      if ((/^https:\/\/(www\.)?crunchyroll.com\/comics\/manga\/(.*)\/volumes$/ig).test(value))
        return true
      throw Error('Invalid URL. The correct format is: https://crunchyroll.com/comics/manga/MANGA_TITLE/volumes');
    },
    when: answers => answers.resume !== 'Yes'
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
      when: answers => answers.format === formatChoices[1] || answers.format === formatChoices[3]
  },
  {
      type: 'rawlist',
      name: 'divideChapters',
      message: 'Divide export file?',
      default: localStorage.getItem('crunchyroll_divideChapters'),
      choices: divideChaptersChoices,
      when: answers => formatChoices.findIndex(choice => choice === answers.format) > 0
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

//  Launch browser and navigate to Crunchyroll

let browser = [Browser.CHROME, Browser.FIREFOX, Browser.EDGE, Browser.OPERA][browserChoices.findIndex(x => x === params.browser)];

(async () => {
  try {

    //  We will store the structure into this
    let mangaData = {
      url: !!params.url ? params.url.trim() : '',
      resumeChapter: 0,
      metadata: {
        publisher: '',
        firstPublished: '',
        author: '',
        artist: '',
        copyright: '',
        translator: '',
        editor: '',
        letterer: '',
      },
      title: '',
      cover: '',
      chapterDivide: 0,
      chapters: []
    }

    let outDir;

    if (params.resume === 'Yes')
      mangaData = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'output', 'resume.json')));

    //  Set chapter division
    switch(params.divideChapters) {
      case divideChaptersChoices[1]:
        mangaData.chapterDivide = 20;
        break;
      case divideChaptersChoices[2]:
        mangaData.chapterDivide = 10;
        break;
      case divideChaptersChoices[3]:
        mangaData.chapterDivide = 5;
        break;
      case divideChaptersChoices[5]:
        mangaData.chapterDivide = 1;
        break;   
      default: 
        mangaData.chapterDivide = 0;
    }

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

    if (params.resume !== 'Yes') {

      //  Go to manga main page and get all info
      console.log('Getting manga data...');

      await loadUrl(driver, mangaData.url, `//h3[contains(text(), 'More Information')]`);

      const infoLines = await driver.findElements(By.xpath(`/html/body/div[2]/div/div[1]/div[3]/div/div[3]/ul/li[3]/ul/li`));
      for (const [index, line] of infoLines.entries()) {
        const dataLine = await line.getAttribute('innerHTML');
        mangaData.metadata[Object.keys(mangaData.metadata)[index]] = dataLine.replace(/<(.*)>/gi, "").trim();
      }

      //  Get whether the right or the left carousel arrow is active

      const clickArrow = async (side) => {
        console.log('Going to:', side)
        let arrow = By.xpath(`//a[contains(@class, 'collection-carousel-${side}arrow')]`);
        await driver.wait(until.elementLocated(arrow));
        const arrowElement = await driver.findElement(arrow);

        let finished = false;
      
        do {
          await arrowElement.click();
          await driver.wait(async () => {
            const tempClasses = await arrowElement.getAttribute('class');
            return !tempClasses.includes('loading');
          });

          finished = (await arrowElement.getAttribute('class')).includes('disabled');
        } while (!finished);
      }

      //  Click all the way left and right
      await clickArrow('left');
      await clickArrow('right');

      //  Now we lazy loaded all thumbnails, let's get their content
      let chaptersXpath = By.xpath(`//div[contains(@class, 'collection-carousel-scrollable')]//a[contains(@class, 'block-link')]`);

      await driver.wait(until.elementsLocated(chaptersXpath));
      const chapters = await driver.findElements(chaptersXpath);
          
      for(const chapter of chapters) {
        mangaData.chapters.push({
          title: await chapter.getAttribute('title'),
          url: await chapter.getAttribute('href'),
          pages: []
        });
      }

      console.log(`This manga has ${mangaData.chapters.length} chapters.`);

      //  Save cover image URL
      const coverXpath = By.xpath(`//img[contains(@class, 'poster')]`);
      await driver.wait(until.elementLocated(coverXpath));
      mangaData.cover = await driver.findElement(coverXpath).getAttribute('src');

      //  Go to manga reader
      await loadUrl(driver, mangaData.chapters[0].url, `//div[@id='manga_reader']`);

      //  Get manga title
      mangaData.title = await driver.findElement(By.xpath(`//header[@class='chapter-header']//a`)).getText();

      //  Create save directory
      outDir = path.join(process.cwd(), 'output', sanitize(mangaData.title));
      console.log(`Output directory: "${outDir}"`);

      if (fs.existsSync(outDir)) {
        if (!params.resumeUrl)
          await deleteOutput(outDir)
      }
        else
          fs.mkdirSync(outDir);

      //  Download cover image
      console.log(`Cover image: ${mangaData.cover}`);
      const coverResponse = await fetch(mangaData.cover, { method: 'GET' });
      const coverBlob = await coverResponse.blob();
      const coverPath = path.join(outDir, 'cover.jpg');
      fs.writeFileSync(coverPath, Buffer.from(await coverBlob.arrayBuffer()), 'binary');
      mangaData.cover = coverPath;
    } else
      outDir = path.join(process.cwd(), 'output', sanitize(mangaData.title));

//  -----------------------------------------------------------------------------------------------------------
//    Recursive chapter reader
//  -----------------------------------------------------------------------------------------------------------

    let currentChapter = (params.resume === 'Yes') ? mangaData.resumeChapter+1 : 0;

//  ===========================================================================================================================

    //  Loop to process all chapters
    do {

      console.log(`Now downloading ${mangaData.chapters[currentChapter].title}...`);

      //  Load manga page
      if (currentChapter > 0)
        loadUrl(driver, mangaData.chapters[currentChapter].url, `//div[@id='manga_reader']`);

      //  Pull scroll bar to page 1
      const barXpath = By.xpath(`/html/body/div[2]/div/div[1]/section/div/article/header/div/input`);
      await driver.wait(until.elementLocated(barXpath), 20000);
      const bar = await driver.findElement(barXpath);
      await bar.click();
      await driver.sleep(3000);
      await bar.sendKeys(Key.HOME);
      await driver.sleep(3000);

      let page = 0;
      const imageXpath = By.xpath(`//ol/li`);
      await driver.wait(until.elementsLocated(imageXpath));
      let images = await driver.findElements(imageXpath);

      console.log(`Chapter has ${images.length} pages.`);

      //  Loop to get pages
      do {
        console.log(`Retrieving ${mangaData.chapters[currentChapter].title}, page ${page+1}...`);
        let image = images[page];

        //  Wait until the image has a background-image tag
        //  This throws a stale element error in Chapter 141.5 page 11
        try {

          await driver.wait(
            (async () => await image.getCssValue('background-image') !== 'none'), 10000
          );

        } catch(e) {
          //  Sometimes the manga page is stale. Reload page if this happens.
          console.log(`Failed to grab page ${page+1}! Reloading page to retry...`);
          await loadUrl(driver, mangaData.chapters[currentChapter].url, `//div[@id='manga_reader']`);
          await driver.wait(until.elementsLocated(imageXpath));
          images = await driver.findElements(imageXpath);
          image = images[page];
          if (!!image)
            console.log('Rescue successful!')
          else
            throw new Error('Unable to rescue page! Please try to run again and resume download.');
        };

        await driver.wait(
          (async () => await image.getCssValue('background-image') !== 'none'), 10000
        );        

        //  Get background image
        const background = await image.getCssValue('background-image');

        if (background !== 'none') {

          //  Check if this is a double page (width > height)
          let pageImage = await jimp.default.read(base64toImage(background));
          const pageWidth = pageImage.getWidth();
          const pageHeight = pageImage.getHeight();

          //  If double, cut it into two files
          if (pageWidth > pageHeight) {
            const halfWidth = Math.round(pageWidth / 2);

            //  Save double images into two pages
            const outputFile1 = path.join(outDir, `${String(currentChapter).padStart(3, '0')}_p${String(page).padStart(3, '0')}_0.jpg`);
            await pageImage.crop(halfWidth, 0, (pageWidth - halfWidth), pageHeight).write(outputFile1);
            mangaData.chapters[currentChapter].pages.push(outputFile1);

            pageImage = await jimp.default.read(base64toImage(background));
            const outputFile2 = path.join(outDir, `${String(currentChapter).padStart(3, '0')}_p${String(page).padStart(3, '0')}_1.jpg`);
            await pageImage.crop(0, 0, Math.round(pageWidth / 2), pageHeight).write(outputFile2);
            mangaData.chapters[currentChapter].pages.push(outputFile2);

          } else {

            //  Save single page image
            const outputFile = path.join(outDir, `${String(currentChapter).padStart(3, '0')}_p${String(page).padStart(3, '0')}.jpg`);
            pageImage.write(outputFile);
            mangaData.chapters[currentChapter].pages.push(outputFile);
          }

          //  Turn page if needed
          if (page % 2 === 0) {
            const btnPath = By.xpath(`//a[contains(@class, 'js-next-link')]`);
            await driver.wait(until.elementLocated(btnPath));
            const button = await driver.findElement(btnPath);
            await button.click();
          }

          page++;

        } else
          console.error(`Image in chapter ${currentChapter} page ${page} cannot be loaded!`);        

      } while(page < images.length);

      mangaData.resumeChapter = currentChapter;
      fs.writeFileSync(path.join(process.cwd(), 'output', 'resume.json'), JSON.stringify(mangaData, null, 2));

      console.log(`All pages finished!`);
      currentChapter++;

    } while (currentChapter < mangaData.chapters.length);

    console.log('Download complete!');

//  ===========================================================================================================================

    //  Thanks, browser, you can now go
    await driver.quit();

//  -----------------------------------------------------------------------------------------------------------
//    Process downloaded data
//  -----------------------------------------------------------------------------------------------------------

    //  Done - let's save it... or not... depends on the settings
    if (params.format === formatChoices[0]) {
      console.log('All done! Bye!');
      process.exit(0);
    }

    //  Convert downloaded images to PDF
    if (params.format === formatChoices[1] || params.format === formatChoices[3]) {
      console.log('Exporting to PDF...');

      const pdfImages = [mangaData.cover];
      let index = 0;
      let lastChapter = 0;
      let chapterCounter = 0;

      do {
        const chapter = mangaData.chapters[index];
        pdfImages.push(...chapter.pages);
        chapterCounter++;

        if (index > 0 && (
          (mangaData.chapterDivide > 0 && (index+1) % mangaData.chapterDivide === 0) || 
          index === mangaData.chapters.length-1)
        ) {

          let filename = '.pdf';
          if (params.chapterDivide !== divideChaptersChoices[0]) {

            filename = chapterCounter > 1 
            ? 
            ` - ${String(lastChapter+1).padStart(3, '0')}-${String(index+1).padStart(3, '0')}.pdf`
            :
            ` - ${String(index+1).padStart(3, '0')}.pdf`;
          }

          filename = path.join(process.cwd(), 'output', sanitize(mangaData.title) + filename);          
          
          imgToPDF(pdfImages, imgToPDF.sizes[params.pdf_pagesize])
            .pipe(fs.createWriteStream(filename));

          lastChapter = index;
          chapterCounter = 0;
          pdfImages.length = 0;
        }

        index++;

      } while (index < mangaData.chapters.length);
    }

    //  Convert downloaded images to EPUB
    if (params.format === formatChoices[2] || params.format === formatChoices[3]) {
      console.log('Exporting to EPUB...');

      const content = [];
      let index = 0;
      let volume = 1;

      do {
        const chapter = mangaData.chapters[index];

        let data = '';
        chapter.pages.forEach((page, pageIndex) => data += `<img src="${page}" title="${mangaData.title} - ${chapter.title} - Page ${pageIndex+1}" style="page-break-after: always;"/>`);
        content.push({
            title: chapter.title,
            index,
            data
        });

        if (index > 0 && (
          (mangaData.chapterDivide > 0 && (index+1) % mangaData.chapterDivide === 0) || 
          index === mangaData.chapters.length-1)
        ) {
    
          const epubContent = {
                  title: `${mangaData.title} - Volume ${volume}.`,
                  author: (!!mangaData.metadata.author ? mangaData.metadata.author : mangaData.metadata.artist) || 'Unknown',
                  publisher: mangaData.metadata.publisher,
                  cover: mangaData.cover,
                  content,
                  version: 3,
                  css: fs.readFileSync(path.join(process.cwd(), 'epub.css'), 'utf-8'),
                  tocTitle: mangaData.title,
                  appendChapterTitles: false
              };

              let filename = '.epub';
              if (params.chapterDivide !== divideChaptersChoices[0]) {

                filename = content.length > 1
                ? 
                ` - ${String(content[0].index+1).padStart(3, '0')}-${String(index+1).padStart(3, '0')}.epub`
                :
                ` - ${String(index+1).padStart(3, '0')}.epub`;
              }

            filename = path.join(process.cwd(), 'output', sanitize(mangaData.title) + filename);
            
            await new Epub(epubContent, filename).promise;

            content.length = 0;
            volume++;
        }

        index++;
      } while (index < mangaData.chapters.length);

//  ---------------------------------------------------------------------------------------------------------------
    }

    deleteOutput(outDir, true);

  } catch(err) {
    if (typeof driver !== 'undefined')
      await driver.quit();
    fatalError(err.message);
  } finally {
    console.log('All done! Bye!');
  }
  
})();
