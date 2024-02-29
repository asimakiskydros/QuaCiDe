import * as Functions from './functions.js';
import * as Alerts    from './alerts.js';
import { circuit }    from './main.js';
import { Circuit }    from './circuit.js';
import { Gate }       from './gate.js';
import { Qubit }      from './qubit.js';

// modal buttons
const selectParamsNote    = document.getElementById('selectParamsDesc');
const loadingCircle       = document.getElementById('loadingCircleWidget');
const lcDesc              = document.getElementById('loadingCircleDesc');
const countsCheckbox      = document.getElementById('countsCheckbox');
const ampsCheckbox        = document.getElementById('ampsCheckbox');
const unitaryCheckbox     = document.getElementById('unitaryCheckbox');
const countsOptionButton  = document.getElementById('showCountsButton');
const ampsOptionButton    = document.getElementById('showAmpsButton');
const unitaryOptionButton = document.getElementById('showUnitaryButton');
const exeButton           = document.getElementById('executeButton');
const backendList         = document.getElementById('backendList');
const shotsBox            = document.getElementById('shotsInputBox');
const checkboxes          = [countsCheckbox, ampsCheckbox, unitaryCheckbox];

// fetch execution window modal
export const modal = document.getElementById('setupModal');

// div containers for the graphs
const container = document.getElementById('outputContainer');

let canvasCounts, canvasAmps, canvasUnitary, abortController;

/**
 * Feeds drag and drop behavior to the given gate.
 * @param {*} gate The newly created gate.
 */
export function handleDragNdrop (gate) {
    let dragging = true;
    // summon extra qubit
    circuit.appendQubit();

    /**
     * Subroutine 1: Dragging. Activated while holding MSB1 (left).
     * 
     * The dragged gate could have been a part of the circuit beforehand
     * and thus be responsible for control wires appearing (if control-ly gate)
     * or double wires (if measurement gate). This routine thus starts by cleaning such messes.
     * At every tempo, if the gate is not hovering over a qubit wire, it just moves the correct amount
     * of pixels and finishes. Otherwise, it snaps the gate on the hovered position, clipping to the side
     * of any already existing gates. It then spawns indicating control/swap/double wires, as the circuit
     * would be should the gate be placed on that exact spot.
     */
    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;

        // disable the nth-power input box when dragging
        // (relevant for nth-power gates)
        if (gate.powerBox) gate.powerBox.style.pointerEvents = 'none';

        // delete unused double wires
        circuit.qubits.forEach(qubit => {qubit.scanForMeasurement(gate)});
        // delete unused control connections
        circuit.connectControls(gate);
        // delete unused swap connections
        circuit.connectSwaps(gate);
        
        // indexize and fetch the qubit wire hovered by the cursor
        let [relativePosition, qubit] = Functions.localize(e, gate, circuit);

        // keep moving if not currently hovering a qubit
        if (!qubit) {
            gate.move(e.clientX, e.clientY);
            return; 
        }

        // if hovering a qubit, pre snap onto it
        qubit.snapOnWirePosition(gate, relativePosition);

        // if the hovering gate is a measurementGate, spawn a double line.
        // Start drawing from the leftmost measurement gate on the qubit
        // among the placed measurement gates, ignoring the potentially placed version of the
        // hovered gate, + the hovering version of the hovered gate.
        if (gate.type === 'measurementGate')
            for (let earliest = -0.5; earliest < relativePosition + 1; earliest += 0.5)
                if (earliest === relativePosition   || 
                    (Number.isInteger(earliest)     && 
                     earliest < qubit.weight        &&
                     qubit.gates[earliest] !== gate &&
                     qubit.gates[earliest].type === 'measurementGate')
                ) {
                    qubit.turnToBit(earliest);
                    break;
                }
        // if the hovered position is an integer, there is a potential for control/swap connection
        // test the defined column for connectivity and if it passes, calculate the
        // relevant indeces to draw the line.
        if (Number.isInteger(relativePosition)){
            // fetch hovered qubit index
            let row;
            for (row = 0; row < circuit.qubits.length; row++) if (circuit.qubits[row] === qubit) break;

            // control connectivity test
            let [start, end, hasQuantumControl, hasClassicalControl, hasGeneric] = circuit.testForControlConnectivity(relativePosition, gate);
            const isControlly = Circuit.getControllyGates().includes(gate.type);
            const isNongeneric = Circuit.getNongenericGates().includes(gate.type);
            if (((hasQuantumControl || hasClassicalControl) && !isControlly && !isNongeneric) || (hasGeneric && isControlly)) {
                if (end === -1) end = start;
                if (start > row) start = row;
                if (end < row) end = row;
                if (!isControlly)
                    circuit.drawConnectorLine(
                        relativePosition, start, end, 'control-wire', 
                        (hasQuantumControl ? 1 : 0) + (hasClassicalControl ? 2 : 0)
                    );
                else {
                    const bitState = qubit.isPositionBit(relativePosition);
                    circuit.drawConnectorLine(
                        relativePosition, start, end, 'control-wire', 
                        (hasQuantumControl || !bitState ? 1 : 0) + (hasClassicalControl || bitState ? 2 : 0)
                    );
                }
            }

            // swap connectivity test
            let [swapStart, swapEnd, swapAmount] = circuit.testForSwapConnectivity(relativePosition, gate);
            // if the dragged gate is a swap gate, and there exists exactly one other swap gate in the column
            // draw indicatory connection
            if (swapAmount === 1 && gate.type === 'swapGate') {
                swapEnd = swapStart;
                if (swapStart > row) swapStart = row;
                if (swapEnd < row) swapEnd = row;
                circuit.drawConnectorLine(relativePosition, swapStart, swapEnd, 'swap-wire');
            }
        }
    });

    /**
     * Subroutine 2: Dropping. Activated on releasing the MSB1 (left).
     * 
     * Detaches the gate from its (potential) previous position and snaps it
     * on the nearest integer position from the one hovered, rounding up.
     * Vanishes the border of customized, placed gates and destroys unplaced ones.
     */
    document.addEventListener('mouseup', (e) => {
        if (!dragging) return;

        // save current state
        circuit.saveSnapshot();

        // terminate dragging
        dragging = false;
        let snapped = false;

        // re-enable the input power box for the nth-power gates
        if (gate.powerBox) gate.powerBox.style.pointerEvents = 'auto';

        // remove the border of a placed gate
        if(['xGate', 'swapGate', 'controlGate', 'anticontrolGate'].includes(gate.type))
            gate.banishBorder();

        // if this gate already existed in some other qubit, remove it from there
        circuit.detachGateFromQubit(gate, gate.owner)

        // fetch hovered qubit and cursor relative position
        let [relativePosition, qubit] = Functions.localize(e, gate, circuit);

        if (qubit) {
            // attach the gate ontop the wire
            circuit.attachGateToQubit(gate, qubit, relativePosition);
            snapped = true;
        }

        // if not attached to any wire, kill gate
        if (!snapped) gate.erase();

        circuit.refresh();
    });
}

/**
 * Parses the result of the event from JSON and builds the described circuit
 * by creating and adding the correct gates back one-by-one (and then feeding
 * them dragNdrop behavior again).
 * 
 * Thwarts execution if the given file doesn't contain the expected format.
 * @param {*} event The event that triggered this behavior.
 */
export function importFromJSON (event) {
    try {
        const template = JSON.parse(event.target.result);
        // ensure given file is correct by examining fetched list
        Functions.assert(template !== null && typeof template === 'object', 'Unrecognized input file format.');
        for (const qubit of Object.values(template)) {
            if (typeof qubit !== 'object') continue;  // skip the .length value

            Functions.assert(Qubit.getDefaultStates().includes(qubit.state), 'Unrecognized qubit state inside input file.');
            Functions.assert(Array.isArray(qubit.gates), 'Unrecognized gate format');
            for (const listing of qubit.gates)
                // try to summon the div with id the listing string. If the listing is correct,
                // there will exist one element that bears such an id (the gates in the toolbox).
                Functions.assert(document.getElementById(listing.split('<!@DELIMITER>')[0]), 'Invalid gate inside input file.')
        }
        circuit.saveSnapshot();
        circuit.buildFromTemplate(template);
    }
    catch (err) {
        Alerts.alertWrongImport();
        console.error(err.message);
    }
}

/**
 * Compiles the current circuit into a template object containing all the 
 * current state information.
 * Then it puts that stringified object in a file and downloads it to the user.
 */
export function exportToJSON () {
    const template = circuit.makeTemplate();       
    const url = window.URL.createObjectURL(
        new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' })
    );
    const anchor = document.createElement('a');
    anchor.style.display = 'none';
    anchor.href = url;
    anchor.download = 'circuit.json';

    // append anchor to body and trigger download
    document.body.appendChild(anchor);
    anchor.click();

    // remove obsolete behavior
    window.URL.revokeObjectURL(url);
    document.body.removeChild(anchor);
}

/**
 * Makes critical buttons inside the modal inoperable
 * until re-enabled. Useful for when waiting for the output
 * of an execution.
 * @param {boolean} state True to disable all important buttons.  
 */
export function disableModalWidgets (state) {
    if (state) {
        for (const widget of checkboxes) widget.disabeld = true;
        exeButton.disabeld = true;
        backendList.disabeld = true;
        shotsBox.disabeld = true;
    }
    else {
        exeButton.disabled = !checkboxes.some(cb => cb.checked);
        backendList.disabeld = !countsCheckbox.checked;
        shotsBox.disabled = !countsCheckbox.checked;
    }
}

/**
 * Remove current canvases if they are initialized.
 */
export function deletePlots () {
    for (const canvas of [canvasCounts, canvasAmps, canvasUnitary])
        if (canvas && container.contains(canvas)) container.removeChild(canvas);
}

/**
 * Hide all plot buttons.
 */
export function vanishPlotButtons () {
    for (const button of [countsOptionButton, ampsOptionButton, unitaryOptionButton])
        button.style.display = 'none';
}

/**
 * Closes the pre-execution modal window.
 * s
 * Destroys all plot containers, aborts all running
 * execution processes and returns modal to default
 * screening for the next invocation.
 */
export function closeModal () {
    if (abortController) abortController.abort();
    
    deletePlots();
    vanishPlotButtons();

    selectParamsNote.style.display = 'flex';
    loadingCircle.style.display = 'none';
    lcDesc.style.display = 'none';
    modal.style.display = 'none';
}

/**
 * Show the div containing the specified plot
 * and hide all other relevant divs.
 * @param which The id of the desired plot.
 */
export function togglePlot (which) {
    if (canvasCounts)
        canvasCounts.style.display  = (which === 'counts')     ? 'flex': 'none';
    if (canvasAmps)
        canvasAmps.style.display    = (which === 'amplitudes') ? 'flex': 'none';
    if (canvasUnitary)
        canvasUnitary.style.display = (which === 'unitary')    ? 'flex': 'none';
}

/**
 * Puts the UI on standby and prepares for communicating with
 * the runner script. Builds the input from the current circuit,
 * the current specified initial state, as well as the values given
 * by the user through the input boxes, and sends an AJAX request to the
 * server. After receiving the dictionary of counts, builds the specified
 * plots, removes UI from standby and projects the histogram first.
 */
export function handleExecution () {
    // hide note and show loading screen
    selectParamsNote.style.display = 'none';
    loadingCircle.style.display = 'flex';
    lcDesc.style.display = 'flex';

    // load fresh web abort controller
    abortController = new AbortController();

    // remove any previous plots
    deletePlots();

    // remove any previous buttons
    vanishPlotButtons();

    // disable all modal interactables while execution runs
    disableModalWidgets(true);
    
    // fetch circuit architecture
    const template = circuit.makeTemplate();
    // fetch checkbox selections
    template.includeCounts = countsCheckbox.checked;
    template.includeAmps = ampsCheckbox.checked;
    template.includeUnitary = unitaryCheckbox.checked;
    // fetch shots and backend from input boxes in the modal GUI
    template.shots = parseInt(
        document.getElementById('shotsInputBox').value || 
        document.getElementById('shotsInputBox').placeholder
    );
    template.backend = document.getElementById('backendList').value;

    // send the circuit to qiskit and wait for the output
    fetch('http://127.0.0.1:5000/parser', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(template),
        signal: abortController.signal,
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP error, status ${response.status}`);

        return response.json();
    })
    .then(results => {
        // remove loading screen and potentially leftover options
        loadingCircle.style.display = 'none';
        lcDesc.style.display = 'none';

        // plot unitary matrix if requested
        if (results.unitary) {
            canvasUnitary = Functions.createUnitaryPlot(container, results);
            unitaryOptionButton.style.display = 'flex';
            togglePlot('unitary');
        }
        // plot amplitudes heatmap if requested
        if (results.amplitudes) {
            canvasAmps = Functions.createAmpsPlot(container, results);
            ampsOptionButton.style.display = 'flex';
            togglePlot('amplitudes');
        }
        // plot counts histogram if requested
        if (results.counts) {
            canvasCounts = Functions.createCountsPlot(container, results);
            countsOptionButton.style.display = 'flex';
            togglePlot('counts');
        }
        
        // re-enable all buttons
        disableModalWidgets(false);
    })
    .catch(error => {
        closeModal();
        if (error.name !== 'AbortError') {
            console.error('Error in AJAX request: ', error);
            Alerts.alertServerError();
        }
    });
}

/**
 * Immediately delete a gate from the circuit by right clicking on it.
 * @param {*} event The mouse event that proc-ed this behavior.
 * @param {*} gate The clicked gate to be deleted.
 */
export function fastDeleteGate (event, gate) {
    // activate only on left click
    if (event.shiftKey || event.ctrlKey || event.button !== 2) return;

    // hide default context menu box
    event.preventDefault();

    // save current state
    circuit.saveSnapshot();

    // remove from qubit, delete and minimize circuit
    circuit.detachGateFromQubit(gate, gate.owner);
    gate.erase();
    circuit.refresh();
}

/**
 * Summon a copy of the shift clicked gate one step to its right
 * on the same qubit (SHIFT click) or one qubit below on the same step
 * (CTRL click).
 * @param {*} e The mouse event that proc-ed this action.
 * @param {*} gate The gate to be copied.
 */
export function fastCopyGate (e, gate) {
    // activate only if either shift or ctrl key are pressed, not both
    if (e.shiftKey == e.ctrlKey) return;

    const qubit = circuit.getQubit(gate.owner);
    if (!qubit) return;
    const i = qubit.argfindGate(gate);
    if (i === null) return;
    
    if (e.shiftKey) {
        circuit.saveSnapshot();

        // copy the gate along with its (potential) power
        const copy = new Gate(document.getElementById(gate.type));
        if (copy.powerBox) copy.powerBox.value = gate.powerBox.value;

        // summon a new column for the new gate
        circuit.attachGateToQubit(copy, qubit, i + 0.5);
        circuit.refresh();
    }
    else if (e.ctrlKey) {
        circuit.prependQubit(
            // create a new qubit below the current one
            circuit.argfindQubit(qubit) + 1, 
            // pad the copied gate with as many identites beforehand as needed
            Array.from({length: i}, () => 'identityGate').concat([gate.stamp])
        );
    }
}

/**
 * Clean-wipe the circuit and return it to the default
 * state.
 */
export function handleClear () {
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
}

/**
 * Summon the execution modal if the circuit is valid.
 */
export function handleRunButton () {                      
    // deny execution if nan exponent was found           
    if (Gate.erroredGates > 0) {
        Alerts.alertErrorsOnCircuit();
        return;
    }
    // enable widgets in new modal
    disableModalWidgets(false);
    // summon modal window
    modal.style.display = 'flex';

    // disable execution button if all options are unchecked
    exeButton.disabled = !checkboxes.some(cb => cb.checked);
    // also disable counts parameter boxes if countsCheckbox is disabled
    backendList.disabled = !countsCheckbox.checked;
    shotsBox.disabled = !countsCheckbox.checked;

    // make the above behavior live on change
    for (const checkbox of checkboxes)
        checkbox.addEventListener('change', () => {
            exeButton.disabled = !checkboxes.some(cb => cb.checked);

            if (checkbox === countsCheckbox) {
                backendList.disabled = !checkbox.checked;
                shotsBox.disabled = !checkbox.checked;
            }
        });
}

/**
 * Test the powered gate for validity. The gate passes the
 * test iff it has an evaluatable exponent and it doesnt currently
 * sit ontop of a bit.
 * @param {*} gate The examined gate.
 * @param {*} value The value of its exponent.
 */
export function handleExponential (gate, value, parent, pos) {
    // remove previous labels
    gate.unmakeErrored(); 
    
    // locate parent and position on parent (if not given)
    parent = parent || circuit.getQubit(gate.owner); 
    pos = pos > -1 ? pos : parent.argfindGate(gate);

    // empty values and powers on bits get eliminated
    if (value === '' ||
        (pos !== null && gate.type !== 'nthZGate' && parent.isPositionBit(pos))
    )
        gate.makeErrored();
    else try {
        math.evaluate(value);
    }
    catch (error) {
        // unevaluatable values get eliminated
        gate.makeErrored();
    }
    // handle run button based on context
    Functions.toggleRunButton();
}