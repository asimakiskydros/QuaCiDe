import { STARTING_QUBITS } from './constants.js';
import { Circuit } from './circuit.js';
import { Gate } from './gate.js';
import * as Behaviors from './behaviors.js';

// initialize circuit
export const circuit = new Circuit(STARTING_QUBITS);
// fetch toolbox
export const toolbox = document.querySelectorAll('gate');

document.addEventListener('DOMContentLoaded', function () {
    for (const gate of toolbox) {
        /**
         * On clicking a gate positioned on the toolbox,
         * spawn an exact copy and feed it drag and drop
         * and fast delete behaviors.
         */
        gate.addEventListener('mousedown', (e) => {
            // activate only on left click
            if (e.button !== 0) return;

            const copy = new Gate(gate);
            // this is needed the first time to move the newly created gate appropriately. idk why
            Behaviors.handleDragNdrop(copy);
            // move copy to cursor
            copy.move(e.clientX, e.clientY);
        });
        /**
         * On hovering a gate on the toolbox, show correct
         * context menu, positioned just above it.
         * Vanish it again on mouseout.
         */
        gate.addEventListener('mouseover', () => {
            const contextMenu = document.getElementById(gate.id + 'Context');
            const gateRect = gate.getBoundingClientRect();
            contextMenu.style.display = 'inline-block';
            contextMenu.style.top = gateRect.bottom + 'px';
            contextMenu.style.left = gateRect.left + 'px';
        })
        gate.addEventListener('mouseout', () => {
            const contextMenu = document.getElementById(gate.id + 'Context');
            contextMenu.style.display = 'none';
        })
    }
    
    /**
     * Wipe the circuit clean on clicking the 'Clear' button
     * inside the toolbox. Sets all kets to ground state and
     * removes all register colors.
     */
    document.getElementById('clearButton').addEventListener('click', Behaviors.handleClear);

    /**
     * Export relevant circuit info to .JSON on clicking
     * the 'Export' button inside the toolbox.
     */
    document.getElementById('exportButton').addEventListener('click', Behaviors.exportToJSON);

    /**
     * Build circuit from user-given info through .JSON's on clicking the
     * 'Import' button.
     *  1. Builds the circuit from the given file
     *     after it deduces it valid.
     *  2. Opens File Explorer.
     */
    /*1.*/document.getElementById('fileInput').addEventListener('change', (e) => {
        let file = e.target.files[0];

        if (file) {
            const reader = new FileReader();
            reader.onload = Behaviors.importFromJSON;
            reader.readAsText(file);
        }
    });
    /*2.*/document.getElementById('importButton').addEventListener('click', () => {
        document.getElementById('fileInput').click();
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
    document.getElementById('showCountsButton').addEventListener('click', () => { Behaviors.togglePlot('counts') });

    /**
     * Change output slide to the Amplitudes heatmap plot on clicking the
     * 'show Amplitudes' option inside the modal.
     */
    document.getElementById('showAmpsButton').addEventListener('click', () => { Behaviors.togglePlot('amplitudes') });

    /**
     * Change output slide to the Unitary matrix plot on clicking the 
     * 'show Unitary' option inside the modal.
     */
    document.getElementById('showUnitaryButton').addEventListener('click', () => { Behaviors.togglePlot('unitary') });

    /**
     * Run the execution script on the described circuit with the given parameters
     * on clicking the 'Execute Simulation' button inside the modal.
     */
    document.getElementById('executeButton').addEventListener('click', Behaviors.handleExecution);

    /**
     * Cancel the youngest action taken and revert the state of the circuit accordingly.
     */
    document.getElementById('undoButton').addEventListener('click', () => { circuit.loadPreviousSnapshot(); });

    /**
     * Take back the youngest undo action and bring the circuit to the state it was before.
     */
    document.getElementById('redoButton').addEventListener('click', () => { circuit.loadNextSnapshot(); });

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
            document.getElementById('fileInput').click();
        }
        else if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
            // CTRL + S -> Export
            e.preventDefault();
            Behaviors.exportToJSON();
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