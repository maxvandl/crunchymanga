# Crunchymanga

## What?
A Node.js Selenium script to download and combine mangas from crunchyroll.com.

## Why?
Crunchyroll is a great site, but they only allow manga to be read online, in a browser. They can't allow direct download because it would cause a host of copyright issues, and subscription would be much more expensive.

This little script logs in to Crunchyroll with the specified username and password, and downloads all pages of a specified manga. In the future, it will also combine them into PDF or EPUB format, so you can read it on your ebook reader.

## Holy cow, isn't that illegal?
No, I don't think so. Crunchyroll premium membership allows the viewing of individual manga pages. To view them, you must download these images. They're then stored on your computer, in the browser cache. The script merely replicates this process and turns pages automatically. Unless you share or distribute the extracted content in any way, you aren't doing anything that goes against the user agreement.

## How to run it?
It's a Node.js script using Selenium. Just clone it, install the packages and run `node .` If you didn't understand a word of this, this script probably isn't for you.

You will also need a premium Crunchyroll subscription. (It's worth buying!)

I am not going to maintain this forever, so if Crunchyroll changes its layout, this script may cease to work. Feel free contributing to it though.

## What does it do?
When you start the script, it will ask a couple of questions. You can choose to download a manga as images only, convert them into PDF or EPUB. You can also choose to divide it into multiple PDF or EPUB files.

It downloads only one manga at a time. It may take a while because some mangas have over 100 chapters.