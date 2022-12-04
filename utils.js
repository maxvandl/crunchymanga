import * as fs from 'fs';
import * as path from 'path';

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
        if (deleteDir)
                fs.rmdirSync(dirname);
}

export function dump(data, filename = 'dump.json') {
        console.log('Dumping to: ' + filename);
        fs.writeFileSync(path.join(process.cwd(), filename), JSON.stringify(data, null, 2));
}
