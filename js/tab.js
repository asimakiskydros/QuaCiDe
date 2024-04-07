import { tabs, circuit, initialSnapshot } from './main.js';
import * as Elements from './elements.js';

let createdTabs = 0;

class Tab {
    /**
     * Spawns a new tab with a fresh empty circuit.
     */
    constructor () {
        this._tablink = Elements.templateTabLink.cloneNode(true);
        this._namebox = this._tablink.querySelector('input');
        this._placeholder = 'Circuit ' + (++createdTabs);
        this._namebox.placeholder = this._placeholder;
        this._snapshot = initialSnapshot;
        this._undoStack = [];
        this._redoStack = [];
        this._hidden = true;
        this._endianness = "\u2B9D";

        // delete this tab on clicking the child tablink's delete button
        this._tablink.querySelector('.delete-tab').addEventListener('click', (e) => {
            e.stopPropagation();

            this._tablink.remove();

            const i = tabs.indexOf(this);
            tabs.splice(i, 1);

            if (tabs.length === 0) Elements.includeTabButton.click();
            else tabs[Math.min(i, tabs.length - 1)].tablink.click();
        });

        // show this tab on single-clicking its tablink
        this._tablink.addEventListener('click', () => {
            for (const tab of tabs) if (!tab.isHidden) tab.hide();

            this.show();
        });

        // change the title of the tab on double-clicking its tablink
        this._tablink.addEventListener('dblclick', () => {
            this._namebox.placeholder = '';
            this._namebox.focus();
        });

        // default to 'Circuit <id>' for empty names.
        this._namebox.addEventListener('blur', () => {
            if (!this._namebox.value) this._namebox.placeholder = this._placeholder;

            circuit.title = this._namebox.value || this._namebox.placeholder;
        });

        // add the new tab to the body
        this._tablink.style.display = 'flex';
        Elements.tabStack.insertBefore(this._tablink, Elements.includeTabButton);
    }
    // getters
    get circuit () {
        return this._circuit;
    }
    get tablink () {
        return this._tablink;
    }
    get isHidden () {
        return this._hidden;
    }
    // setters
    set snapshot (template) {
        this._snapshot = template;
    }
    set title (name) {
        this._namebox.value = name;
    }
    /**
     * Save the current template and hide this tab.
     */
    hide () {
        if (this._hidden) return;

        this._snapshot = circuit.makeTemplate();
        [this._undoStack, this._redoStack] = circuit.undoRedoStacks;
        this._tablink.style.zIndex = 0;
        this._hidden = true;
        this._endianness = circuit.endianness;
        if (this._tablink.classList.contains('active')) this._tablink.classList.remove('active');
    }
    /**
     * Build the saved template and show this tab.
     */
    show () {
        if (!this._hidden) return;

        this._tablink.style.zIndex = 2;
        circuit.undoRedoStacks = [this._undoStack, this._redoStack];
        circuit.title = this._namebox.value || this._namebox.placeholder || 'circuit';
        circuit.endianness = this._endianness;
        circuit.buildFromTemplate(this._snapshot);
        this._hidden = false;
        if (!this._tablink.classList.contains('active')) this._tablink.classList.add('active');
    }
}

export { Tab };