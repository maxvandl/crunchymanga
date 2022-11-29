# Crunchymanga

## What?
A Node.js Selenium script to download and combine manga from crunchyroll.com.

## Why?
Crunchyroll is a great site, but they only allow manga to be read online, in a browser. They can't allow direct download because it would cause a host of copyright issues, and subscription would be much more expensive.

This little script logs in to Crunchyroll with the specified username and password, and downloads all pages of a specified manga. In the future, it will also combine them into PDF or EPUB format, so you can read it on your ebook reader.

## Holy cow, isn't that illegal?
No, I don't think so. Crunchyroll premium membership allows the viewing of individual manga pages. To view them, you must download these images. They're then stored on your computer, in the browser cache. The script merely replicates this process and turns pages automatically. Unless you share or distribute the extracted content in any way, you aren't doing anything that goes against the user agreement.

## How to run it?
It's a Node.js script. Just clone it, install the packages and run `node .` or something.

You will need a premium Crunchyroll subscription. (It's worth buying!)

I am not going to maintain this forever, so if Crunchyroll changes its layout, this script may cease to work. Feel free contributing to it though.
