import { Circuit } from './circuit';
import { Template } from './template';

let createdTabs = 0;

/**
 * Each tab holds each own unique circuit.
 */
export class Tab {
    public readonly tablink: JQuery<HTMLElement>; // tab link button on the ribbon
    public hidden: boolean;                       // flag for whether the tab is currently hidden or shown
    public snapshot: Template;                    // the snapshot this tab was left in; the snapshot to load when active

    constructor (tabs: Tab[], circuit: Circuit, initialSnapshot: Template) {
        this.tablink  = $('#template-tab').clone().css('display', 'flex');
        this.hidden   = true;
        this.snapshot = initialSnapshot;
        // the default name of every tab is `Circuit #tab`
        this.tablink.find('input').attr('placeholder', `Circuit ${++createdTabs}`);
        // dont play the starting animation for the first tab in the ribbon
        if (tabs.length === 0) this.tablink.css('animation', 'none');

        this.tablink
            // SHOW TAB
            .on('click', () => { 
                // hide active tabs (realistically only one can be active but better to be certain)
                for (const tab of tabs) if (!tab.hidden) {
                    tab.hidden = true;
                    tab.snapshot = new Template(circuit);
                    tab.tablink.removeClass('active');
                }
                // show this tab and load its snapshot
                this.hidden = false;
                this.tablink.addClass('active');
                this.snapshot.applyTo(circuit);
            })
            // make the new tab active
            .trigger('click') 
            // CHANGE TAB TITLE
            .on('dblclick', () => { 
                this.tablink.find('input').trigger('focus');
            })
        .find('delete-tab')
            // DELETE TAB
            .on('click', (e) => { 
                e.stopPropagation();
    
                const index = tabs.indexOf(this);
                this.tablink.remove(); // remove the tablink graphic
                tabs.splice(index, 1); // and the tab object from mem
    
                // if after deletion the tab ribbon has no tabs, create a new one immediately
                if (tabs.length === 0) $('#include-tab').trigger('click');
                // highlight immediate neighbor tablink on the right; if nonexistent,
                // highlight the immediate neighbor on the left.
                else tabs[Math.min(index, tabs.length - 1)].tablink.trigger('click');                                                                  
            });

        $('.add-tab').before(this.tablink);  // place tablink just before the add tab button
        tabs.push(this); // add this tab to the ribbon array
    }

    public get title () {
        return this.tablink.find('input').val() || this.tablink.find('input').attr('placeholder')!;
    }

    public set title (title: string) {
        if (title) this.tablink.find('input').val(title);
    }
}