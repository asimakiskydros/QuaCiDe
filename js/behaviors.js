import * as Functions from './functions.js';
import * as Constants from './constants.js';
import * as Alerts from './alerts.js';
import { circuit } from './main.js';
import { Circuit } from './circuit.js';
import { Gate } from './gate.js';
import { Qubit } from './qubit.js';

// modal buttons
const selectParamsNote = document.getElementById('selectParamsDesc');
const loadingCircle = document.getElementById('loadingCircleWidget');
const lcDesc = document.getElementById('loadingCircleDesc');
const optionsMenu = document.getElementById('optionsMenu');

// fetch execution window modal
export const modal = document.getElementById('setupModal');

// div containers for the graphs
const container = document.getElementById('outputContainer');

let canvasHist, canvasHeat, abortController;

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
        const powerInputBox = gate.body.querySelector('.textbox');
        if (powerInputBox) powerInputBox.style.pointerEvents = 'none';

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
            let [start, end, hasControl, hasGeneric] = circuit.testForControlConnectivity(relativePosition, gate);
            const isControlly = Circuit.getControllyGates().includes(gate.type);
            const isNongeneric = Circuit.getNongenericGates().includes(gate.type);
            if ((hasControl && !isControlly && !isNongeneric) || (hasGeneric && isControlly)) {
                if (end === -1) end = start;
                if (start > row) start = row;
                if (end < row) end = row;
                circuit.drawConnectorLine(relativePosition, start, end, 'control-wire');
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
        const powerInputBox = gate.body.querySelector('.textbox');
        if (powerInputBox) powerInputBox.style.pointerEvents = 'auto';

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
            
            // feed this same behavior to the newly created gate.
            // avoid infinite recursion and multiple identical event listeners
            // by blocking old created gates.
            if (!gate.hasDragNdrop) {
                gate.body.addEventListener('mousedown', (event) => {
                    if (event.button === 0) handleDragNdrop(gate);
                });
                gate.hasDragNdrop = true;
            }
        }

        // if not attached to any wire, kill gate
        if (!snapped) gate.erase();

        circuit.minimize();
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
                Functions.assert(document.getElementById(listing.split('-')[0]), 'Invalid gate inside input file.')
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
        new Blob([JSON.stringify(template)], { type: 'application/json' })
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
    [document.getElementById('executeButton'),
     document.getElementById('backendList'),
     document.getElementById('shotsInputBox')
    ]
    .forEach(widget => {widget.disabled = state;});
}

/**
 * Closes the pre-execution modal window.
 * 
 * Destroys all plot containers, aborts all running
 * execution processes and returns modal to default
 * screening for the next invocation.
 */
export function closeModal () {
    if (abortController) abortController.abort();
    if (container.contains(canvasHeat)) container.removeChild(canvasHeat);
    if (container.contains(canvasHist)) container.removeChild(canvasHist);

    selectParamsNote.style.display = 'flex';
    loadingCircle.style.display = 'none';
    lcDesc.style.display = 'none';
    modal.style.display = 'none';
    optionsMenu.style.display = 'none';
}

/**
 * Show the div containing the histogram plot
 * and hide all other relevant divs.
 */
export function toggleHistogram () {
    canvasHeat.style.display = 'none';
    canvasHist.style.display = 'flex';
}

/**
 * Show the div containing the heatmap plot
 * and hide all other relevant divs.
 */
export function toggleHeatmap () {
    canvasHist.style.display = 'none';
    canvasHeat.style.display = 'flex';
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
    if (container.contains(canvasHeat)) container.removeChild(canvasHeat);
    if (container.contains(canvasHist)) container.removeChild(canvasHist);

    // disable all modal interactables while execution runs
    disableModalWidgets(true);
    
    // fetch circuit architecture
    const template = circuit.fetchStringifiedGates();
    // fetch initial state
    const initialState = circuit.fetchInitialState();
    // fetch shots and backend from input boxes in the modal GUI
    const shots = parseInt(document.getElementById('shotsInputBox').value || 
                           document.getElementById('shotsInputBox').placeholder
                        );
    const backend = document.getElementById('backendList').value;

    // send the circuit to qiskit and wait for the output
    fetch('http://127.0.0.1:5000/parser', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ template, initialState, shots, backend }),
        signal: abortController.signal,
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP error, status ${response.status}`);

        return response.json();
    })
    .then(results => {
        // remove loading screen
        loadingCircle.style.display = 'none';
        lcDesc.style.display = 'none';
        
        // initialize containers
        canvasHist = Functions.createPlotCanvas('canvasHistogram', container.clientHeight, container.clientWidth);
        canvasHeat = Functions.createPlotCanvas('canvasHeatmap', container.clientHeight, container.clientWidth);

        // load graphs
        container.appendChild(canvasHist);
        container.appendChild(canvasHeat);

        // plot histogram
        Plotly.newPlot('canvasHistogram', [{
            x: Object.keys(results.counts),
            y: Object.values(results.counts),
            type: 'bar',
            orientation: 'v',
            marker: { color: 'lightgreen' }
        }],{
            title: 'Counts',
            xaxis: {
                autotypenumbers: 'strict',
                tickangle: 60,
        }});

        // plot heatmap
        const [y, x, z, text] = Functions.data2heatmap(results.amplitudes, results.probabilites);

        Plotly.newPlot('canvasHeatmap', [{
            y: y.map(item => item + '_'),
            x: x.map(item => '_' + item),
            z: z,
            hoverinfo: 'text',
            text: text,
            type: 'heatmap',
            colorscale: 'Greens',
            reversescale: true,
        }], {
            title: 'Amplitude matrix',
            hoverlabel: { align: 'left' },
            yaxis: { autotypenumbers: 'strict', },
            xaxis: { autotypenumbers: 'strict',
                     tickangle: 90,             },
        });

        // load histogram first
        canvasHist.style.display = 'flex';

        // re-enable all buttons
        disableModalWidgets(false);

        // reveal graph options menu
        optionsMenu.style.display = 'flex';
    })
    .catch(error => {
        closeModal();
        if (error.name !== 'AbortError') {
            console.error('Error in AJAX request: ', error);
            Alerts.alertServerError();
        }
    });
}