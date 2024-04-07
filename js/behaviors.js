import * as Functions from './functions.js';
import * as Alerts    from './alerts.js';
import * as Elements  from './elements.js';
import { Circuit }    from './circuit.js';
import { Gate }       from './gate.js';
import { tabs } from './main.js';
import { Tab } from './tab.js';
import { circuit } from './main.js';

// compile all checkboxes for easier use
export const checkboxes = [Elements.countsCheckbox, Elements.ampsCheckbox, Elements.unitaryCheckbox];
// set server ip
export const serverIP = 'http://127.0.0.1:5000';
// fetch execution window modal
export const modal = document.querySelector('modal');
// fetch gatebuilder window
export const gatebuilder = document.querySelector('gatebuilder');

let canvasCounts, canvasAmps, canvasUnitary, abortController, createdGates = 0;

// store tab-shiftable divs 
const focusablesMain  = [
    Elements.includeTabButton, Elements.addGateButton,
    Elements.runButton, Elements.undoButton, Elements.redoButton,
    Elements.clearButton, Elements.importButton, Elements.exportButton
];
const focusablesModal = [
    Elements.countsCheckbox, Elements.backendList, Elements.shotsInputBox,
    Elements.ampsCheckbox, Elements.unitaryCheckbox,Elements.countsOptionButton,
    Elements.ampsOptionButton, Elements.unitaryOptionButton,
    Elements.exeButton, Elements.closeModalButton
];
const focusablesGB    = [
    Elements.symbol, Elements.title, Elements.context,
    Elements.createGateButton, Elements.closeGBButton
];

/**
 * Feeds drag and drop behavior to the given gate.
 * @param {*} gate The newly created gate.
 */
export function handleDragNdrop (gate) {
    let dragging = true;

    // summon extra qubit
    circuit.appendQubit();
    // refresh borders to account for the new qubit
    circuit.refreshBorders(gate);

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
        let [relativePosition, qubit] = Functions.localize(e, gate);

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
        if (Number.isInteger(relativePosition)) {
            // fetch hovered qubit index
            let row;
            for (row = 0; row < circuit.qubits.length; row++) if (circuit.qubits[row] === qubit) break;

            // control connectivity test
            let [start, end, hasQuantumControl, hasClassicalControl, hasGeneric] = circuit.testForControlConnectivity(relativePosition, gate);
            const isControl = gate.type === 'controlGate';
            const isNongeneric = Circuit.getNongenericGates().includes(gate.type);
            if (((hasQuantumControl || hasClassicalControl) && !isControl && !isNongeneric) || (hasGeneric && isControl)) {
                if (end === -1) end = start;
                if (start > row) start = row;
                if (end < row) end = row;
                if (!isControl)
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
        const snapshot = circuit.makeTemplate();

        // terminate dragging
        dragging = false;
        let snapped = false;

        // re-enable the input power box for the nth-power gates
        if (gate.powerBox) gate.powerBox.style.pointerEvents = 'auto';

        // remove the border of a placed gate
        if(['xGate', 'swapGate', 'controlGate'].includes(gate.type))
            gate.banishBorder();

        // if this gate already existed in some other qubit, remove it from there
        circuit.detachGateFromQubit(gate, gate.owner)

        // fetch hovered qubit and cursor relative position
        let [relativePosition, qubit] = Functions.localize(e, gate);

        if (qubit) {
            // attach the gate ontop the wire
            circuit.attachGateToQubit(gate, qubit, relativePosition);
            snapped = true; 
        }

        // if not attached to any wire, kill gate
        if (!snapped) gate.erase();

        circuit.saveSnapshot(snapshot);
        circuit.refresh();
    });
}

/**
 * Builds a new tab as described by the user-given file.
 * This file is expected to be of identical format as the one handleExport returns,
 * and every object is validate beforehand. 
 * 
 * All custom gates specified into this file that cannot be found in exact identical format
 * (same symbol, title, context and definition) are created anew first, then the final 
 * circuit gets created and shown. The tab name is the filename without the extension.
 * @param {*} event The event that proc-ed this behavior.
 */
export function handleImport (event) {
    const file = event.target.files[0];

    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = () => {
        const lines = reader.result.split('\r\n');
        const currentCustoms = Elements.customGatesList.querySelectorAll('gate');

        try { for (let i = 0; i < lines.length; i++) {
            // fetch JSON line
            const line = lines[i].trim()
            const template = JSON.parse(line);
            // validate represented object
            Functions.validateObject(template);

            if (i < lines.length - 1) {
                let exists = false;
                // if its any object before the last one, its a used custom gate.
                // create it if not existing
                for (const gate of currentCustoms) if (
                    gate.id !== '^' && 
                    gate.id !== 'templateCustomGate' && 
                    gate.definition === line  // compare the two definition objects as strings to ensure equality by value
                    ) {
                        exists = true;
                        break;
                    }
                if (!exists) createCustomGate(template);
            }
            else {
                // if its the last object, then it is the circuit representation.
                // spawn a new tab and show it
                const tab = new Tab();
                tab.snapshot = template;
                tab.title = file.name.split('.')[0];
                tabs.push(tab);
                tab.tablink.click();
            }
        }}
        catch (error) {
            Alerts.alertWrongImport();
            console.error(error.message);
        }
    }
    reader.readAsText(file);
}

/**
 * Compiles all used custom gate definitions and the loaded circuit
 * as individual JSON strings into an array.
 * 
 * The custom gate definitions are included in the file by order of 
 * creation, meaning the oldest (used) gate is first and the newest (used)
 * gate is second-to-last; the circuit architecture is guaranteed last.
 * @returns The array containing all relevant JSON strings as explained.
 */
export function compileLoaded () {
    const payload = [];
    const template = JSON.stringify(circuit.makeTemplate());       
    for (const gate of Elements.customGatesList.querySelectorAll('gate'))
        if (gate.id !== '^' && gate.id !== 'templateCustomGate' && template.includes(gate.id))
            // include only actively used custom gates
            payload.push(gate.definition);
    // include the circuit template last for tractability
    payload.push(template);
    return payload
}

/**
 * Creates a JSONLines file containing the current circuit snapshot and all used custom gates
 * in it, then downloads it to the user as a .quacide file.
 */
export function handleExport () {
    // create download anchor
    const url = window.URL.createObjectURL(
        new Blob([compileLoaded().join('\r\n')], { type: 'application/json' })
    );
    const anchor = document.createElement('a');
    anchor.style.display = 'none';
    anchor.href = url;
    anchor.download = `${circuit.title}.quacide`;

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
        for (const widget of checkboxes) widget.disabled = true;
        Elements.exeButton.disabled = true;
        Elements.backendList.disabled = true;
        Elements.shotsInputBox.disabled = true;
    }
    else {
        for (const widget of checkboxes) widget.disabled = false;
        Elements.exeButton.disabled = !checkboxes.some(cb => cb.checked);
        Elements.backendList.disabled = !Elements.countsCheckbox.checked;
        Elements.shotsInputBox.disabled = !Elements.countsCheckbox.checked;
    }
}

/**
 * Remove current canvases if they are initialized.
 */
export function deletePlots () {
    for (const canvas of [canvasCounts, canvasAmps, canvasUnitary])
        if (canvas && Elements.container.contains(canvas)) Elements.container.removeChild(canvas);
}

/**
 * Hide all plot buttons.
 */
export function vanishPlotButtons () {
    for (const button of [Elements.countsOptionButton, Elements.ampsOptionButton, Elements.unitaryOptionButton])
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

    Elements.selectParamsNote.style.display = 'flex';
    Elements.noOutputsNote.style.display = 'none';
    Elements.loadingTexture.style.display = 'none';
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
    // hide notes and show loading screen
    Elements.selectParamsNote.style.display = 'none';
    Elements.noOutputsNote.style.display = 'none';
    Elements.loadingTexture.style.display = 'grid';

    // load fresh web abort controller
    abortController = new AbortController();

    // remove any previous plots
    deletePlots();

    // remove any previous buttons
    vanishPlotButtons();

    // disable all modal interactables while execution runs
    disableModalWidgets(true);
    
    // fetch current instance info
    const payload  = compileLoaded();
    // retreive circuit architecture temporarily to append extra info
    const template = JSON.parse(payload.pop())
    // fetch checkbox selections
    template.includeCounts  = Elements.countsCheckbox.checked;
    template.includeAmps    = Elements.ampsCheckbox.checked;
    template.includeUnitary = Elements.unitaryCheckbox.checked;
    // fetch selected endianness
    template.bigEndian      = document.getElementById('endianness').textContent === "\u2B9D";
    // fetch shots and backend from input boxes in the modal GUI
    template.shots = parseInt(
        Elements.shotsInputBox.value || Elements.shotsInputBox.placeholder
    );
    template.backend = Elements.backendList.value;
    // re-include the padded template
    payload.push(JSON.stringify(template));

    // send the circuit to qiskit and wait for the output
    fetch(`${serverIP}/parser`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload.join('\r\n')),
        signal: abortController.signal,
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP error, status ${response.status}`);

        return response.json();
    })
    .then(results => {
        // remove loading screen and potentially leftover options
        Elements.loadingTexture.style.display = 'none';

        // plot unitary matrix if requested
        if (results.unitary) {
            canvasUnitary = Functions.createUnitaryPlot(Elements.container, results);
            Elements.unitaryOptionButton.style.display = 'flex';
            togglePlot('unitary');
        }
        // plot amplitudes heatmap if requested
        if (results.amplitudes) {
            canvasAmps = Functions.createAmpsPlot(Elements.container, results);
            Elements.ampsOptionButton.style.display = 'flex';
            togglePlot('amplitudes');
        }
        // plot counts histogram if requested
        if (results.counts) {
            canvasCounts = Functions.createCountsPlot(Elements.container, results);
            Elements.countsOptionButton.style.display = 'flex';
            togglePlot('counts');
        }
        
        if (!results.counts && !results.amplitudes && !results.unitary)
            // reveal the no outputs label in case no plots appear
            Elements.noOutputsNote.style.display = 'flex';

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
    if (event.altKey || event.shiftKey || event.ctrlKey || event.button !== 2) return;

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
    const step = qubit.argfindGate(gate);
    if (step === null) return;
    
    circuit.saveSnapshot();
    // copy the gate along with its (potential) power
    const copy = new Gate(document.getElementById(gate.type), gate.span);
    if (copy.powerBox) copy.powerBox.value = gate.powerBox.value;
    

    if (e.shiftKey)
        // summon a new column for the new gate
        circuit.attachGateToQubit(copy, qubit, step + 0.5);
    else {
        // for vertical copying, the new gate and every existing gate must jump 'span' positions downward.
        const i = circuit.argfindQubit(qubit);
        // the last qubit index that holds a gate prior to change. The conditional exists because
        // in the starting circuit state, the last qubit may not hold any gates and still exist.
        const lastGateIdx = circuit.qubits.length - (circuit.qubits.at(-1).weight > 0 ? 1 : 2);
        // add 'span' new qubits; the extra length(height) required is that of the copy
        for (let j = 0; j < gate.span; j++) circuit.appendQubit();

        for (let j = lastGateIdx; j >= i + gate.span; j--) {
            const qOther = circuit.qubits[j];
            // for every existing non-trivial gate, looking from the bottom up, move it 'span' positions downward
            if (step < qOther.weight && qOther.gates[step].type !== 'identityGate' && qOther.gates[step].type[0] !== '^') {
                const residentGate = qOther.gates[step];
                circuit.detachGateFromQubit(residentGate, residentGate.owner);
                circuit.attachGateToQubit(residentGate, circuit.qubits[j + gate.span], step);
            }
        }
        // add the copy 'span' positions down the original
        circuit.attachGateToQubit(copy, circuit.qubits[i + gate.span], step);
    }
    circuit.refresh();
}

/**
 * Clean-wipe the circuit and return it to the default
 * state.
 */
export function handleClear () {
    // save current state
    const snapshot = circuit.makeTemplate();

    // wipe the circuit
    circuit.empty();
    circuit.resetCounters();

    for (const qubit of circuit.qubits) {
        qubit.state.textContent = '|0〉';
        qubit.registerColor = '';
    }
    circuit.updateRegisterBorders();
    circuit.refreshToolbarWidgets();

    // push saved snapshot if different
    circuit.saveSnapshot(snapshot);
}

/**
 * Summon the execution modal if the circuit is valid.
 */
export function handleRunButton () {                      
    // deny execution if there are errors in the circuit           
    if (circuit.erroredGates > 0) {
        Alerts.alertErrorsOnCircuit();
        return;
    }
    // enable widgets in new modal
    disableModalWidgets(false);
    // summon modal window
    modal.style.display = 'flex';

    // disable execution button if all options are unchecked
    Elements.exeButton.disabled = !checkboxes.some(cb => cb.checked);
    // disable backend list and shots box if counts is unchecked
    Elements.backendList.disabled = !Elements.countsCheckbox.checked;
    Elements.shotsInputBox.disabled = !Elements.countsCheckbox.checked;
    // unfocus from the currently focused element
    document.activeElement.blur();
}

/**
 * Test the powered gate for validity. The gate passes the
 * test iff it has an evaluatable exponent and it doesnt currently
 * sit ontop of a bit.
 * @param {*} gate The examined gate.
 * @param {*} value The value of its exponent.
 * @param {*} parent (Optional) The qubit owner of the given gate.
 * @param {*} pos (Optional) The step/qubit position of the gate.
 */
export function handleExponential (gate, value, parent, pos) {
    // remove previous labels
    gate.unmakeErrored(); 
    
    // locate parent and position on parent (if not given)
    parent = parent || circuit.getQubit(gate.owner); 
    pos = pos > -1 ? pos : parent.argfindGate(gate);

    // empty values and powers on bits get eliminated
    
    if (pos !== null && parent.isPositionBit(pos))
        gate.makeErrored('This gate cannot exist ontop of a bit.');
    else try {
        // if the given text is not computable, this will throw
        const result = math.evaluate(value);
        // some text inputs also work with evaluate... dont understand why,
        // but throw anyway
        if (value === '' || typeof result !== 'number') throw Error();
    }
    catch (error) {
        // unevaluatable values get eliminated
        gate.makeErrored('Invalid exponent.');
    }
    // handle run button based on context
    Functions.toggleRunButton();
    Functions.toggleAddGateButton();
}

/**
 * Shuffle gate displays on alt-click.
 * Works for measurement and control gates only.
 * @param {*} event The event that proc-ed this behavior.
 * @param {*} gate The gate clicked.
 * @param {*} textures The carousel of image displays.
 * @param {*} labels The carousel of alt label displays.
 * @param {*} iconsDir The folder name of all the image textures.
 * @returns The index of the next texture used.
 */
export function changeGateDisplay (event, gate, textures, labels, iconsDir) {
    // fire only on alt + click
    if (!event.altKey || event.button !== 0 || event.shiftKey || event.ctrlKey) return;

    // save current state
    circuit.saveSnapshot(); 

    // fetch current image and calculate the next one on the carousel
    const display = gate.body.querySelector('img');
    const [host, img] = display.src.split(`/${iconsDir}/`);
    const nextState = (textures.indexOf(img) + 1) % textures.length;

    // apply new image and alt desc
    display.src = `${host}/${iconsDir}/${textures[nextState]}`;
    display.alt = labels[nextState];

    return nextState;
}

/**
 * Draw the dashed border behind the post-selected measurement gate.
 * @param {*} gate The clicked measurement gate.
 */
export function handlePostSelectionBorder (gate) {
    const step = circuit.getQubit(gate.owner).argfindGate(gate);
    const oldBorder = document.getElementById('border-wire' + step);
    
    // remove old border
    if (oldBorder) document.querySelector('circuit-canvas').removeChild(oldBorder);

    // paint new border if display shows postselection
    if (gate.display > 0) circuit.drawBorderLine(step);
}

/**
 * Summons the gate builder window.
 * Defaults to 'from unitary' option if the current circuit is
 * invalid.
 */
export function handleGateBuilder () {
    // disallow creation if the circuit is empty, contains measurements or has errors
    if (Elements.addGateButton.disabled) {
        Alerts.alertCreationDisallowed();
        return;
    }
    // summon window
    gatebuilder.style.display   = 'flex';
    Elements.symbol.placeholder = `CG#${createdGates + 1}`;
    Elements.title.placeholder  = `Custom Gate #${createdGates + 1}`;
    // unfocus from the currently focused element
    document.activeElement.blur();
}

/**
 * Create the custom gate stamp/spawner based on the creation and
 * description information given by the user through the gatebuilder,
 * then add it to the toolbox and close the gatebuilder window.
 * @param {*} definition (Optional) The imported gate definition object.
 */
export function createCustomGate (definition) {
    // create new custom gate spawner.
    const gate = Elements.templateCustomGate.cloneNode(true);
    gate.id = `customGate-${createdGates++}`;

    // set symbol
    const gateSymbol = definition?.symbol || Elements.symbol.value || Elements.symbol.placeholder;
    gate.innerHTML = `<span>${gateSymbol}</span>`;
    // this changes for custom gates, idk why.
    gate.style.marginRight = '14px';

    // if the given symbol string is too long, decrease its font size linearly down to a minimum.
    if (gateSymbol.length > 2) 
    gate.querySelector('span').style.fontSize = Math.max(7, -4 * gateSymbol.length + 30) + 'px';

    // create gate context
    const gateContext = document.createElement('gate-context');
    gateContext.id = gate.id + 'Context';
    if (definition) gateContext.innerHTML = definition.context;
    else {
        gateContext.innerHTML = `<b>${Elements.title.value || Elements.title.placeholder}</b><br>`;
        for (const line of Functions.explode(Elements.context.value, Math.max(Elements.title.value.length, 20) + 5)) 
            gateContext.innerHTML += `<br>${line}`;
        gateContext.innerHTML += `<br><br>SHIFT+Click to delete.`;
    }

    // save the gate definition inside its object structure
    if (definition) {
        gate.definition = JSON.stringify(definition);
        gate.qubitSpan = definition.length;
    }
    else {
        const snapshot   = circuit.makeTemplate();
        snapshot.symbol  = gateSymbol;
        snapshot.context = gateContext.innerHTML;
        snapshot.id      = gate.id;
        gate.definition  = JSON.stringify(snapshot);
        gate.qubitSpan   = snapshot.length; 
    }

    // add context to body
    document.body.appendChild(gateContext);
    // add new gate to the toolbox, initialize and close
    gate.style.display = 'inline-block';
    Elements.customGatesList.appendChild(gate);
    initializeGate(gate, true);
    closeGatebuilder();
}

/**
 * Remove leftover strings inside the inputboxes and hide the gatebuilder.
 */
export function closeGatebuilder () {
    Elements.symbol.value = '';
    Elements.title.value = '';
    Elements.context.value = '';
    gatebuilder.style.display = 'none';
}

/**
 * Add the standard event listeners to the given gate.
 * @param {*} gate The toolbox gate (HTML element).
 * @param {boolean} isCustom (For custom gates) Whether the passed template is a user-defined gate.
 */
export function initializeGate (gate, isCustom) {
    /**
     * On clicking a gate positioned on the toolbox,
     * spawn an exact copy and feed it drag and drop
     * and fast delete behaviors.
     */
    gate.addEventListener('mousedown', (e) => {
        // activate only on left click
        if (e.button !== 0 || e.shiftKey || e.ctrlKey || e.altKey) return;
        // create new gate based on specifications
        const copy = new Gate(gate, isCustom ? gate.qubitSpan : 1);
        // this is needed the first time to move the newly created gate appropriately. idk why
        handleDragNdrop(copy);
        // move copy to cursor
        copy.move(e.clientX, e.clientY);
    });

    const contextMenu = document.getElementById(gate.id + 'Context');
    /**
     * On hovering a gate on the toolbox, show correct
     * context menu, positioned just above it.
     * Vanish it again on mouseout.
     */
    if (contextMenu) {
        gate.addEventListener('mouseover', () => {
            const gateRect = gate.getBoundingClientRect();
            contextMenu.style.display = 'inline-block';
            contextMenu.style.top = gateRect.bottom + 'px';
            contextMenu.style.left = gateRect.left + 'px';
        });
        gate.addEventListener('mouseout', () => {
            contextMenu.style.display = 'none';
        });
    }

    /**
     * Delete the custom gate from the toolbox on SHIFT + clicking
     */
    if (isCustom) gate.addEventListener('click', (e) => {
        if (!e.shiftKey || e.button !== 0) return;

        if (window.confirm("This action will remove this gate. Are you sure?")) {
            gate.remove();
            contextMenu.remove();
        }
    });
}

/**
 * Shift through the next element to focus on TAB press on the specific window.
 * @param {*} e The event that proc-ed this behavior.
 * @param {*} which The concerned window ('modal', 'gatebuilder'). Everything else 
 *                  evaluates to the main webpage.
 */
export function handleTabPress (e, which) {
    // shift through specific divs on tab shuffle
    e.preventDefault();
            
    let focusables = undefined;
    switch (which) {
        case 'modal':
            focusables = focusablesModal;
            break;
        case 'gatebuilder':
            focusables = focusablesGB;
            break;
        default:
            focusables = focusablesMain;
    }

    // cycle through the elements, backwards if shift is pressed, forwards otherwise, until
    // an enabled element is found
    let i = (focusables.indexOf(document.activeElement) + (e.shiftKey ? -1 : 1) + focusables.length) % focusables.length;
    while((focusables[i].hasAttribute('disabled') && focusables[i].disabled) || focusables[i].style.display === 'none') 
        i = (i + (e.shiftKey ? -1 : 1) + focusables.length) % focusables.length;

    // focus the enabled element
    focusables[i].focus();
}