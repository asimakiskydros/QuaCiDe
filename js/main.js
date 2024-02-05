import { STARTING_QUBITS } from './constants.js';
import { Circuit } from './circuit.js';
import { Gate } from './gate.js';
import { alertNoMeasuring } from './alerts.js';
import * as Behaviors from './behaviors.js';

// initialize circuit
export const circuit = new Circuit(STARTING_QUBITS);
// fetch toolbox
export const toolbox = document.querySelectorAll('.gate');

document.addEventListener('DOMContentLoaded', function () {
    /**
     * On clicking a gate positioned on the toolbox,
     * spawn an exact copy and feed it drag and drop
     * and fast delete behaviors.
     */
    toolbox.forEach(gate => {
        gate.addEventListener('mousedown', (e) => {
            // activate only on left click
            if (e.button !== 0) return;

            const copy = new Gate(gate);
            // move copy to cursor
            copy.move(e.clientX, e.clientY);
            
            // feed dragNdrop
            Behaviors.handleDragNdrop(copy);
            // feed fast delete
            copy.body.addEventListener('contextmenu', (event) => {
                // activate only on left click
                if (event.button !== 2) return;

                // hide default context menu box
                event.preventDefault();

                // save current state
                circuit.saveSnapshot();

                // remove from qubit, delete and minimize circuit
                circuit.detachGateFromQubit(copy, copy.owner);
                copy.erase();
                circuit.minimize();
            });
        });
    });
    
    /**
     * Wipe the circuit clean on clicking the 'Clear' button
     * inside the toolbox. Sets all kets to ground state and
     * removes all register colors.
     */
    document.getElementById('clearButton').addEventListener('click', () => {
        // save current state
        circuit.saveSnapshot();

        // wipe the circuit
        circuit.empty();
        Gate.resetCounters();

        for (const qubit of circuit.qubits) {
            qubit.state.textContent = '|0〉';
            qubit.registerColor = '';
        }
        circuit.updateRegisterBorders();
        circuit.refreshStatCounters();
    })

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
    document.getElementById('runButton').addEventListener('click', () => {
        // deny execution if no measurement gates were placed
        if (Gate.placedMeasurementGates === 0) {
            alertNoMeasuring();
            return;
        }

        // enable widgets in new modal
        Behaviors.disableModalWidgets(false);
        // summon modal window
        Behaviors.modal.style.display = 'flex';
        document.body.style.overflowY = 'hidden';
    });

    /**
     * Clicking outside the modal's borders assumes the user wants to exit it
     * and head back to the main UI.
     */
    Behaviors.modal.addEventListener('click', (e) => {
        if (e.target === Behaviors.modal) 
            Behaviors.modal.style.display = 'none';

    });

    /**
     * Close the modal window and return to the main UI after clicking the
     * 'Close' button inside the modal.
     */
    document.getElementById('closeModal').addEventListener('click', Behaviors.closeModal);

    /**
     * Change output slide to the Histogram plot on clicking the
     * 'show Histogram' option inside the modal.
     */
    document.getElementById('showHistButton').addEventListener('click', Behaviors.toggleHistogram);

    /**
     * Change output slide to the Heatmap plot on clicking the
     * 'show Heatmap' option inside the modal.
     */
    document.getElementById('showHeatButton').addEventListener('click', Behaviors.toggleHeatmap);

    /**
     * Run the execution script on the described circuit with the given parameters
     * on clicking the 'Execute Simulation' button inside the modal.
     */
    document.getElementById('executeButton').addEventListener('click', Behaviors.handleExecution);

    /**
     * When right-clicking over a ket state, its border shuffles between colors.
     * Neighboring kets with same-colored borders get unified into a single register.
     * If right-clicking anywhere else, return only default behavior (simple context menu).
     */
    document.addEventListener('contextmenu', () => {
        for (const qubit of circuit.qubits)
            if (qubit.state.matches(':hover'))
                circuit.updateRegisterBorders();
    });

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
        // if the modal is up prohibit these actions
        if (Behaviors.modal.style.display !== 'none') return;

        if (e.ctrlKey && e.shiftKey && (e.key === 'z' || e.key === 'Z'))
            // CTRL + SHIFT + Z -> Redo
            circuit.loadNextSnapshot();
        else if (e.ctrlKey && (e.key === 'y' || e.key === 'Y'))
            // CTRL + Y -> Redo
            circuit.loadNextSnapshot();
        else if (e.ctrlKey && (e.key === 'z' || e.key === 'Z'))
            // CTRL + Z -> Undo
            circuit.loadPreviousSnapshot();
        else if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
            // CTRL + S -> Export
            e.preventDefault();
            Behaviors.exportToJSON();
        }
    });
});