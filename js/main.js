import { Tab } from './tab.js';
import { Circuit } from './circuit.js';
import { STARTING_QUBITS } from './constants.js';
import * as Behaviors from './behaviors.js';
import * as Elements  from './elements.js';

// initialize tab stack
export const tabs = [];
// initialize circuit
export const circuit = new Circuit(STARTING_QUBITS);
// save initial circuit template for later
export const initialSnapshot = circuit.makeTemplate();
// fetch toolbox
export const toolbox = document.querySelectorAll('gate');

// scrollable divs info
const gateList = document.querySelector('gate-list');
const tabContent = document.querySelector('tab-content');
const gateListScrollTop = gateList.scrollTop;
const tabContentScrollTop = tabContent.scrollTop;
const tabContentScrollLeft = tabContent.scrollLeft;

document.addEventListener('DOMContentLoaded', function () {
    /**
     * On pressing the cross button, add a fresh tab.
     */
    Elements.includeTabButton.addEventListener('click', () => {
        const tab = new Tab();
        if (tabs.length === 0) tab.tablink.style.animation = 'none';
        tabs.push(tab);
        tab.tablink.click();
    });

    // spawn initial tab
    includeTabButton.click();

    for (const gate of toolbox) Behaviors.initializeGate(gate);

    /**
     * disable the execution button if no checkboxes are checked
     */
    for (const checkbox of Behaviors.checkboxes)
        checkbox.addEventListener('change', () => {
            Elements.exeButton.disabled = !Behaviors.checkboxes.some(cb => cb.checked);

            if (checkbox === Behaviors.checkboxes[0]) {
                Elements.backendList.disabled = !checkbox.checked;
                Elements.shotsInputBox.disabled = !checkbox.checked; 
            }
        });
    
    /**
     * Wipe the circuit clean on clicking the 'Clear' button
     * inside the toolbox. Sets all kets to ground state and
     * removes all register colors.
     */
    Elements.clearButton.addEventListener('click', Behaviors.handleClear);

    /**
     * Export relevant circuit info to .JSONLines on clicking
     * the 'Export' button inside the toolbox.
     */
    Elements.exportButton.addEventListener('click', Behaviors.handleExport);

    /**
     * Build circuit from user-given info through .JSON's on clicking the
     * 'Import' button.
     *  1. Builds the circuit from the given file
     *     after it deduces it valid.
     *  2. Opens File Explorer.
     */
    /*1.*/Elements.fileInputButton.addEventListener('change', Behaviors.handleImport);
    /*2.*/Elements.importButton.addEventListener('click', () => {
        Elements.fileInputButton.click();
    });

    /**
     * Make the main UI uninteractable and invoke the pre-execution modal
     * on clicking the 'Run Circuit' button.
     */
    Elements.runButton.addEventListener('click', Behaviors.handleRunButton);

    /**
     * Clicking outside the modal's borders assumes the user wants to exit it
     * and head back to the main UI.
     */
    Behaviors.modal.addEventListener('click', (e) => {
        if (e.target === Behaviors.modal) Behaviors.closeModal();
    });

    /**
     * Close the modal window and return to the main UI after clicking the
     * 'Close' button inside the modal.
     */
    Elements.closeModalButton.addEventListener('click', Behaviors.closeModal);

    /**
     * Change output slide to the Counts histogram plot on clicking the
     * 'show Counts' option inside the modal.
     */
    Elements.countsOptionButton.addEventListener('click', () => { Behaviors.togglePlot('counts') });

    /**
     * Change output slide to the Amplitudes heatmap plot on clicking the
     * 'show Amplitudes' option inside the modal.
     */
    Elements.ampsOptionButton.addEventListener('click', () => { Behaviors.togglePlot('amplitudes') });

    /**
     * Change output slide to the Unitary matrix plot on clicking the 
     * 'show Unitary' option inside the modal.
     */
    Elements.unitaryOptionButton.addEventListener('click', () => { Behaviors.togglePlot('unitary') });

    /**
     * Run the execution script on the described circuit with the given parameters
     * on clicking the 'Execute Simulation' button inside the modal.
     */
    Elements.exeButton.addEventListener('click', Behaviors.handleExecution);

    /**
     * Cancel the youngest action taken and revert the state of the circuit accordingly.
     */
    Elements.undoButton.addEventListener('click', () => { circuit.loadPreviousSnapshot(); });

    /**
     * Take back the youngest undo action and bring the circuit to the state it was before.
     */
    Elements.redoButton.addEventListener('click', () => { circuit.loadNextSnapshot(); });

    /**
     * Summon the gate builder window on clicking the 'add gate' button.
     */
    Elements.addGateButton.addEventListener('click', Behaviors.handleGateBuilder);

    /**
     * Close the gate builder window on clicking the 'close' button.
     */
    Elements.closeGBButton.addEventListener('click', Behaviors.closeGatebuilder);

    /**
     * Create the new custom gate spawner based on specified inputs and add it to the toolbox.
     */
    Elements.createGateButton.addEventListener('click', () => { Behaviors.createCustomGate(); });

    /**
     * Close the gate builder window if the user clicks out of bounds.
     */
    Behaviors.gatebuilder.addEventListener('click', (e) => {
        if (e.target === Behaviors.gatebuilder) Behaviors.closeGatebuilder();
    });

    /**
     * Return to original scrolling position in the gatelist when clicking the toolbox title.
     */
    document.querySelector('toolbox-title').addEventListener('click', () => { gateList.scrollTop = gateListScrollTop; });
    
    /**
     * Return to original scrolling position in the circuit when clicking the main title.
     */
    document.querySelector('main-title').addEventListener('click', () => { 
        tabContent.scrollTop = tabContentScrollTop; 
        tabContent.scrollLeft = tabContentScrollLeft; 
    });

    /**
     * Toggle Endian format on clicking the toolbar toggler.
     */
    const endianToggle = document.getElementById('endianness');
    endianToggle.addEventListener('click', () => {
        // up arrow --> down arrow | down arrow --> up arrow
        const wasBigEndian = endianToggle.textContent === "\u2B9D";
        if (wasBigEndian) endianToggle.textContent = "\u2B9F";
        else endianToggle.textContent = "\u2B9D";

        // inform the loaded circuit of the change
        circuit.endianness = endianToggle.textContent;

        endianToggle.title = 
`Current format: ${wasBigEndian ? 'Little': 'Big'} Endian
|a〉---------
                        loads as |${wasBigEndian ? 'ba' : 'ab'}〉
|b〉---------

Click to toggle.`
    });

    /**
     * Add keyboard shortcuts for common actions.
     */
    document.addEventListener('keydown', (e) => {
        // if the modal is up allow only modal-specific actions
        if (Behaviors.modal.style.display !== 'none') {
            // Escape -> close modal
            if (e.key === 'Escape') Behaviors.closeModal();
            else if (e.key === 'Tab') Behaviors.handleTabPress(e, 'modal');
            return;            
        }
        // likewise, if the gatebuilder is up allow only gb-specific actions
        if (Behaviors.gatebuilder.style.display !== 'none') {
            // Escape -> close gatebuilder
            if (e.key === 'Escape') Behaviors.closeGatebuilder();
            else if (e.key === 'Tab') Behaviors.handleTabPress(e, 'gatebuilder');
            return;
        }

        if (e.key == 'Tab') 
            // CTRL + A -> Element shift
            Behaviors.handleTabPress(e);
        else if (e.ctrlKey && e.shiftKey && (e.key === 'z' || e.key === 'Z'))
            // CTRL + SHIFT + Z -> Redo
            circuit.loadNextSnapshot();
        else if (e.ctrlKey && (e.key === 'y' || e.key === 'Y'))
            // CTRL + Y -> Redo
            circuit.loadNextSnapshot();
        else if (e.ctrlKey && (e.key === 'z' || e.key === 'Z'))
            // CTRL + Z -> Undo
            circuit.loadPreviousSnapshot();
        else if (e.ctrlKey && e.shiftKey && (e.key === 's' || e.key === 'S')) {
            // CTRL + SHIFT + S -> Import
            e.preventDefault();
            Elements.fileInputButton.click();
        }
        else if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
            // CTRL + S -> Export
            e.preventDefault();
            Behaviors.handleExport();
        }
        else if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
            // CTRL + C -> Clear
            e.preventDefault();
            Behaviors.handleClear();
        }
        else if (e.ctrlKey && (e.key === 'x' || e.key === 'X')) {
            // CTRL + X -> Run
            e.preventDefault();
            Behaviors.handleRunButton();
        }
        else if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
            // CTRL + A -> Add gate
            e.preventDefault();
            Behaviors.handleGateBuilder();
        }
    });
});