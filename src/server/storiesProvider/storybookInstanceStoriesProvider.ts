import { BrowserConfig, isDefined, StoriesProviderFactory } from "../../types";
import { getBrowser } from "../selenium";
import { convertStories } from "./webpackStoriesProvider";

export const createStorybookInstanceStoriesProvider: StoriesProviderFactory = (context) => ({
    async loadTestsFromStories(options) {
        console.log(context);

        const browser = await getBrowser(context.config, context.config.browsers['chrome'] as BrowserConfig);
        
        if (!browser) {
            return {};
        }

        const currentUrl = await browser.getCurrentUrl();

        console.log(currentUrl);
        await browser.get(currentUrl.replace('/iframe.html', ''))
        await new Promise(resolve => setTimeout(resolve, 5000));
        const stories: any= await browser.executeScript(() => {
            // @ts-ignore
            return window.__CREEVEY_STORIES__;
        });
        console.log(stories);
        await browser.close();

        const tests = convertStories(options.browsers, stories);

      
        return tests;


        // assertStories(response)

        // utils.convertStories(response)

        // const stories = await getStoriesFromStorybookInstnace(this.browser, this.)
        
    }
})

