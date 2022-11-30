import Epub from 'epub-gen';
import sanitize from 'sanitize-filename';
import * as path from 'path';
import * as fs from 'fs';

export async function generateEpub(params) {

    console.log('Exporting to EPUB...');

    const content = [];
    let chapter = Number(params.files[0].substr(2, 3));
    console.log(`First chapter: ${chapter}`);

    let lastChapter = '';
    let chapterHTML = '';
    params.files.forEach((filename, index) => {
        const chapterName = filename.substr(0, 5);

        if (chapterName !== lastChapter) {
            lastChapter = chapterName;
            if (!!chapterHTML)
                content.push({
                    title: `Chapter ${chapter}`,
                    data: chapterHTML
                });
            chapterHTML = '';
            chapter = Number(filename.substr(2, 3));
        }

        chapterHTML += `<img src="${path.join(params.dir, filename)}" title="${params.mangaInfo.title} Chapter ${chapter} Page ${index}" style="page-break-after: always;"/>`;
    });

    const epubContent = {
            title: params.mangaInfo.title,
            author: !!params.mangaInfo.author ? params.mangaInfo.author : params.mangaInfo.artist,
            publisher: params.mangaInfo.publisher,
            cover: params.cover,
            content,
            version: 3,
            css: fs.readFileSync(path.join(process.cwd(), 'epub.css'), 'utf-8'),
            tocTitle: params.mangaInfo.title,
            appendChapterTitles: false
        };

    fs.writeFileSync(path.join(process.cwd(), 'epubContent.json'), JSON.stringify(epubContent, null, 2));

    new Epub(
        epubContent, 
        path.join(process.cwd(), 'output', sanitize(params.mangaInfo.title) + '.epub')
    );    

};