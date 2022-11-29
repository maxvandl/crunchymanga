import * as fs from 'fs';
import { fatalError, base64toImage } from './utils.js';
import inquirer from 'inquirer';
import { LocalStorage } from 'node-localstorage';
import sanitize from 'sanitize-filename';
import * as path from 'path';

import { Builder, Browser, By, until } from 'selenium-webdriver';

const localStorage = new LocalStorage('./localstorage');

console.log(`CrunchyManga 1.0 by TomcatMWI - A handy utility to save mangas on your device!`);

//  Query parameters

  const browserChoices = ['Chrome', 'Firefox', 'Edge', 'Opera'];

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
      name: 'method',
      message: 'How shall we save the manga?',
      default: localStorage.getItem('crunchyroll_method'),
      choices: ['Images', 'PDF', 'EPUB']
  },
  {
      type: 'rawlist',
      name: 'overwrite',
      message: 'Overwrite previous download if exists?',
      default: localStorage.getItem('crunchyroll_overwrite'),
      choices: ['Yes, overwrite', 'No, stop if exists']
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
  localStorage.setItem('crunchyroll_method', params.method);
  localStorage.setItem('crunchyroll_overwrite', params.overwrite);

//  Launch browser and navigate to Crunchyroll

let browser = [Browser.CHROME, Browser.FIREFOX, Browser.EDGE, Browser.OPERA][browserChoices.findIndex(x => x === params.browser)];

(async () => {
  const driver = await new Builder().forBrowser(browser).build();

  try {
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

    //  Wait for main page to load, then go to manga URL
    await driver.wait(until.elementLocated(By.xpath(`//span[contains(text(), 'Log Out')]`)));
    await driver.wait(until.elementLocated(cookieButton));
    await driver.findElement(cookieButton).click();
    await driver.get(params.url);

    //  Wait until manga reader loads
    await driver.wait(until.elementLocated(By.id('manga_reader')));

    //  Get manga title
    let mangaTitle = await driver.getTitle();
    mangaTitle = mangaTitle.replace(/Crunchyroll - Read /igm, '').replace(/ Chapter 1 Online/igm, '').trim();
    console.log(`Manga title: "${mangaTitle}"`);

    let mangaChapter = params.url.match(/(\d*)$/igm)[0];
    console.log(`Starting chapter: ${mangaChapter}`);

    //  Create save directory
    const outDir = path.join(process.cwd(), 'output', sanitize(mangaTitle));
    console.log(`Output directory: "${outDir}"`);

    if (fs.existsSync(outDir))
      if (params.overwrite === 'No')
        throw new Error(`Output directory "${outDir}" already exists. Please remove it and try again.`);
      else {
        fs.readdirSync(outDir).forEach(file => {
            console.log('Deleting: ', file)
            fs.unlinkSync(path.join(outDir, file))
          });
      }
    else
      fs.mkdirSync(outDir);

    //  Loop!

    let page = 0;

    const getCurrentPages = async () => {
      console.log('getCurrentPages running!');

      //  Get current page
      const imageXpath = By.xpath(`//ol/li`);
      await driver.wait(until.elementsLocated(imageXpath));
      const images = await driver.findElements(imageXpath);

      for(let image of images) {

        //  Wait until the image has a background-image tag
        await driver.wait(
          (async () => await image.getCssValue('background-image') !== 'none')
        );
        const background = await image.getCssValue('background-image');
        console.log('Length: ', background.length);

        if (background !== 'none') {
            base64toImage(background, path.join(outDir, `ch${String(mangaChapter).padStart(3, '0')}_p${String(page).padStart(3, '0')}.jpg`));
            page++;

            const btnPath = By.xpath(`//a[contains(@class, 'js-next-link')]`);
            await driver.wait(until.elementLocated(btnPath));
            const button = await driver.findElement(btnPath);
            await button.click();
            console.log('getCurrentPages finished!');

            if (page < images.length)
              await getCurrentPages();
        } else
          console.error(`Image on page ${page} cannot be loaded!`);
      }

    }      


    console.log('It starts!');
    await getCurrentPages();
    console.log('It ends!');

  } catch(err) {
    fatalError(err.message);
  } finally {
    // await driver.quit();
    console.log('Process completed!')
  }
})();

//  Save page images

//  Find next chapter

//  If there's no next chapter, we're done

//  Convert images to PDF if needed

//  Convert images to EPUB

//  Done!

