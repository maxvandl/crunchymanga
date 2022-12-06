import * as fs from 'fs';
import * as path from 'path';
import { By } from 'selenium-webdriver';

export function fatalError(message = 'Fatal error') {
        console.log();
        console.error(message);
        process.exit();
}

export function base64toImage(base64, filename) {
        base64 = base64
                .replace(/^url\("data:image\/jpeg;base64,/igm, '')
                .replace(/"\)$/igm, '');
        let buf = Buffer.from(base64, 'base64');
        if (!!filename)
                fs.writeFileSync(filename, buf, err => console.log(!err ? `Error saving: ${err.message}` : `Saved ${filename}`));
        return buf;
}

export function deleteOutput(dirname, deleteDir = false) {
        console.log('Deleting downloaded images...');
        fs.readdirSync(dirname).forEach(file => fs.unlinkSync(path.join(dirname, file)));
        const resumeFile = path.join(process.cwd(), 'output', 'resume.json');
        if (fs.existsSync(resumeFile))
                fs.unlinkSync(resumeFile);
        if (deleteDir)
                fs.rmdirSync(dirname);
}

export function dump(data, filename = 'dump.json') {
        console.log('Dumping to: ' + filename);
        fs.writeFileSync(path.join(process.cwd(), filename), JSON.stringify(data, null, 2));
}

export async function loadUrl(driver, url, xpath_string) {

        await driver.get(url);

        //  Retry for 1 minute if we got the error page
        await driver.wait(async () => {
          const errors = await driver.findElements(By.xpath(`//p[contains(text(), 'We are sorry. A team of shinobi is working to bring your anime back. Thank you for your patience.')]`));
          const content = await driver.findElements(By.xpath(xpath_string));
          
          if (!!content.length)
            return true;

          if (!!errors.length) {
            await driver.get(url);
            return false;
          }
        }, 60000, 'Page load timed out', 5000);        

}