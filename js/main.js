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

document.addEventListener('DOMContentLoaded', function () {
    /**
     * On pressing the cross button, add a fresh tab.
     */
    Elements.includeTabButton.addEventListener('click', () => {
        const tab = new Tab(tabs.length);
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
            Behaviors.exeButton.disabled = !Behaviors.checkboxes.some(cb => cb.checked);

            if (checkbox === Behaviors.checkboxes[0]) {
                Behaviors.backendList.disabled = !checkbox.checked;
                Behaviors.shotsBox.disabled = !checkbox.checked; 
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
    document.getElementById('exportButton').addEventListener('click', Behaviors.handleExport);

    /**
     * Build circuit from user-given info through .JSON's on clicking the
     * 'Import' button.
     *  1. Builds the circuit from the given file
     *     after it deduces it valid.
     *  2. Opens File Explorer.
     */
    /*1.*/Elements.fileInputButton.addEventListener('change', Behaviors.handleImport);
    /*2.*/document.getElementById('importButton').addEventListener('click', () => {
        Elements.fileInputButton.click();
    });

    /**
     * Make the main UI uninteractable and invoke the pre-execution modal
     * on clicking the 'Run Circuit' button.
     */
    document.getElementById('runButton').addEventListener('click', Behaviors.handleRunButton);

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
    document.getElementById('closeModal').addEventListener('click', Behaviors.closeModal);

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
    document.getElementById('executeButton').addEventListener('click', Behaviors.handleExecution);

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
    document.getElementById('addGate').addEventListener('click', Behaviors.handleGateBuilder);

    /**
     * Close the gate builder window on clicking the 'close' button.
     */
    document.getElementById('closeGatebuilder').addEventListener('click', Behaviors.closeGatebuilder);

    /**
     * Create the new custom gate spawner based on specified inputs and add it to the toolbox.
     */
    document.getElementById('createGateButton').addEventListener('click', () => { Behaviors.createCustomGate(); });

    /**
     * Close the gate builder window if the user clicks out of bounds.
     */
    Behaviors.gatebuilder.addEventListener('click', (e) => {
        if (e.target === Behaviors.gatebuilder) Behaviors.closeGatebuilder();
    });

    /**
     * Disable the unitary matrix input widgets if the corresponding radio isn't selected.
     */
    for (const radio of document.querySelectorAll('input[name="source"]')) radio.addEventListener('change', Behaviors.handleUnitaryMatrixImport);

    /**
     * Add keyboard shortcuts for common actions.
     */
    document.addEventListener('keydown', (e) => {
        // if the modal is up allow only modal-specific actions
        if (Behaviors.modal.style.display !== 'none') {
            // Escape -> close modal
            if (e.key === 'Escape') Behaviors.closeModal();
            return;            
        }
        // likewise, if the gatebuilder is up allow only gb-specific actions
        if (Behaviors.gatebuilder.style.display !== 'none') {
            // Escape -> close gatebuilder
            if (e.key === 'Escape') Behaviors.closeGatebuilder();
            return;
        }

        if (e.ctrlKey && e.shiftKey && (e.key === 'z' || e.key === 'Z'))
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
    });
});