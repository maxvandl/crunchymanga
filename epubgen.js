import Epub from 'epub-gen';
import sanitize from 'sanitize-filename';
import * as path from 'path';
import * as fs from 'fs';

export const  generateEpub = async (params) => {
    if (!params.files || !params.files.length)
        return reject(new Error('No files to process!'));

    console.log('Exporting to EPUB...');

    const content = [];
    let chapter = Number(params.files[0].substr(2, 3));
    console.log(`First chapter: ${chapter}`);

    let previousChapter = '';
    let chapterHTML = '';
    params.files.forEach((filename, index) => {
        const chapterName = filename.substr(0, 5);

        if (chapterName !== previousChapter) {
            previousChapter = chapterName;
            console.log('Adding chapter: ', chapter);
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

    //  Add last chapter
    if (!!chapterHTML) {
        console.log('Adding chapter: ', chapter);
        content.push({
            title: `Chapter ${chapter}`,
            data: chapterHTML
        });
    }

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

    new Epub(
        epubContent, 
        path.join(process.cwd(), 'output', sanitize(params.mangaInfo.title) + '.epub')
    );

}