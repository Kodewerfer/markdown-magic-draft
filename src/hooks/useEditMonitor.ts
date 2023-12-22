import React, {useState, useLayoutEffect} from "react";

export default function useEditMonitor(
    WatchElementRef: { current: HTMLElement | undefined | null }
) {


    useLayoutEffect(() => {

        if (!WatchElementRef.current) {
            return;
        }

        const SourceHTML = WatchElementRef.current;

        const contentEditableCached = SourceHTML.contentEditable;

        try {
            SourceHTML.contentEditable = 'plaintext-only';
        } catch (e) {
            SourceHTML.contentEditable = 'true';
        }


        const ObserverConfig: MutationObserverInit = {
            childList: true,
            subtree: true,
            characterData: true,
            characterDataOldValue: true,

        };

        const callback = (mutationList: MutationRecord[], observer: any) => {
            for (const mutation of mutationList) {
                if (mutation.type === "childList") {
                    console.log("A child node has been added or removed.");
                } else if (mutation.type === "characterData") {
                    console.log(`The ${mutation.oldValue} characterData was modified.`);
                }
            }
        };

        const Observer = new MutationObserver(callback);
        Observer.observe(SourceHTML, ObserverConfig);


        // clean up
        return () => {
            Observer.disconnect();
            SourceHTML.contentEditable = contentEditableCached;
        }

    }, [WatchElementRef.current!]);
}