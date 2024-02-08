import * as Constants from './constants.js';
import * as Behaviors from './behaviors.js';
import { Qubit } from './qubit.js';
import { Gate } from './gate.js';

// tools
const canvas = document.getElementById('canvas');
const identityGate = document.getElementById('identityGate');
let undoStack = [], redoStack = [];

// lookup tables
const controllyGates = ['controlGate', 'anticontrolGate'];
const nongenericGates = ['identityGate', 'measurementGate'];
const connectorTypes = ['control-wire', 'swap-wire'];
const poweredGates = ['nthXGate', 'nthYGate', 'nthZGate'];

class Circuit {
    constructor(startingQubits) {
        this._qubits = [];
        this._qubitCounter = 0;
        this._depth = Constants.TOP_BOUNDARY;
        this._columns = 0;

        // initialize the circuit with as many starting qubits as requested
        for (let i = 0; i < startingQubits; i++) this.appendQubit();
    }
    // getters
    get qubits () {
        return this._qubits;
    }
    /**
     * Update the rightmostIndex flag to hold the length of the nose of the gate pyramid
     * in the register. This also acts as the position the next far-right-ly placed gate
     * should land on.
     */
    #updateColumns () {
        this._columns = Math.max(...this._qubits.map(qubit => qubit.weight));
    }
    /**
     * Increment/decrease the stat counters and update the depth of the circuit
     * when adding/removing qubits.
     * @param {boolean} adding true means a qubit was added, so increment constants.
     *                         false means the opposite.
     */
    #updateCounters (adding) {
        if (adding) {
            this._qubitCounter++;
            this._depth += Constants.BLANK_SPACE;
        }
        else {
            this._qubitCounter--;
            this._depth -= Constants.BLANK_SPACE;
        }
        // display new counter stats to UI
        this.refreshStatCounters();
    }
    /**
     * Update the stat trackers on the bottom right of the UI
     * according to the current data.
     */
    refreshStatCounters () {
        const qubitsCounter = document.getElementById('qubitsCounter');
        qubitsCounter.textContent = 'Qubits: ' + this._qubits.length;

        const gatesCounter = document.getElementById('gatesCounter');
        gatesCounter.textContent = 'Gates: ' + (Gate.gatesCounter - Gate.identitiesCounter);

        const stepsCounter = document.getElementById('stepsCounter');
        stepsCounter.textContent = 'Steps: ' + this._columns;
    }
    /**
     * Push a new qubit to the register.
     * @returns the new qubit's wire and state element id.
     */
    appendQubit () {
        // create qubit object
        const qubit = new Qubit(this._qubitCounter, this._depth);
        this._qubits.push(qubit);

        // push to canvas
        canvas.appendChild(qubit.container);

        // update counters
        this.#updateCounters(true);

        // return state and wire ids for future reference
        return [qubit.stateID, qubit.wireID];
    }
    /**
     * Remove the last qubit from the register
     */
    popQubit () {
        // delete qubit object
        const qubit = this._qubits.pop();

        // remove from canvas
        qubit.container.remove();

        // update counters
        this.#updateCounters(false);
    }
    /**
     * Loop over the register and find the (at most) one qubit wire that is being hovered
     * by the user cursor.
     * @param {*} e The mouse event that triggered this behavior.
     * @returns The reference to the hovered qubit or null if none was found.
     */
    findHoveredQubit (e) {
        for (const qubit of this._qubits) if (qubit.isHovered(e))
            return qubit;

        return null;
    }
    /**
     * Find a qubit that matches the given id, either in wire or in state format.
     * @param {*} id the qubit's wire or state id.
     * @returns the qubit, if an eligible one was found. Null otherwise.
     */
    getQubit (id) {
        for (const qubit of this._qubits) if (qubit.wireID === id || qubit.stateID === id)
            // found qubit with either wire or state id the same as the given
            return qubit;

        // no qubits with that id
        return null;
    }
    /**
     * Discard unused qubit wires and clean empty ones, working from the bottom up.
     * The set default number of wires remains the same, whether they are unused or not.
     * 
     * If all wires are being used nothing happens.
     */
    minimize () {
        // clean-wipe qubits that contain only identities
        for (const qubit of this._qubits) if (qubit.empty) qubit.clear();

        // delete all rows that contain only identities
        this.#updateColumns();
        const length = this._columns;
        const empty_cols = Array.from({ length }, () => true);

        for (let col = 0; col < length; col++)
            for (const qubit of this._qubits) if (col < qubit.weight)
                empty_cols[col] = empty_cols[col] && qubit.gates[col].type === 'identityGate';

        // any remaining trues means this column is empty and needs to be deleted
        for (let col = 0; col < length; col++) {
            if (!empty_cols[col]) continue;

            for (const qubit of this._qubits) if (col < qubit.weight) qubit.detachGate(qubit.gates[col]);
        }

        // delete any unused qubit wires
        while (
            // if the last qubit has 0 gates
            this._qubits[this._qubitCounter - 1].empty
            &&
            // and the qubit counter is greater than the set minimum
            this._qubitCounter > Constants.STARTING_QUBITS
        )
            this.popQubit();

        this.connectControls();
        this.connectSwaps();
        this.updateRegisterBorders();
        this.refreshStatCounters();
    }
    /**
     * Empties the entire register, deleting all gates and all extra qubits.
     */
    empty () {
        // delete all gates
        for (const qubit of this._qubits) qubit.clear();

        // all qubits are now empty. Revert to starting position
        this.minimize();
    }
    /**
     * Attaches the given gate to the given qubit, after translating the given relative position into
     * a valid index. Integers mean a direct mapping and placement, while floats mean right-shifting the qubits.
     * @param {*} gate The gate to be attached.
     * @param {*} qubit The qubit on which the gate is to be attached.
     * @param {*} pos The relative desired position to attach the gate on the wire.
     */
    attachGateToQubit (gate, qubit, pos) {
        this.#updateColumns();

        // if the relative position is way far on the right with respect to the rightmost gate already placed,
        // default to the nose of the gate pyramid.
        if (pos > this._columns) {
            // attach the gate and skip the rest
            qubit.attachGate(gate, this._columns, false);
            return;
        }
        // if the given relative position is a float, this means the user attempted to
        // 'squish' the given gate, demanding the creation of a new column.
        if (!Number.isInteger(pos)) {
            // place the gate on the next immediate integer index
            pos = Math.ceil(pos);
            // and shift all the qubits once to the right, starting from this position.
            this._qubits.forEach(other => {other.attachGate(new Gate(identityGate), pos, false)});
        }
        // pre-calculate whether the position currently holds an invisible identity gate or an actual gate.
        // if the first one, it is safe to paste over it, if not, shift-right the qubit.
        const override = pos < qubit.weight && qubit.gates[pos].type === 'identityGate';   
        qubit.attachGate(gate, pos, override);
    }
    /**
     * Detaches the given gate from the qubit with the given id, if both of them are found and valid.
     * Leaves behind an invisible identity gate, to hold the gate train in place or get discarded if unnecessary.
     * @param {*} gate The gate to be detached.
     * @param {*} id The qubit's id that holds the given gate, typically the gate.owner .
     */
    detachGateFromQubit (gate, id) {
        // find the qubit that owns this gate
        const ownerQubit = this.getQubit(id);
        if (!ownerQubit) return;

        // if found, delete and check the relevant column for emptiness
        ownerQubit.detachGate(gate);
    }
    /**
     * Scans the register for columns that contain control-ly gates and draws connector lines
     * accordingly. It refreshes old ones, meaning it deletes every previously drawn line and
     * starts from the beginning.
     * @param {*} ignored (Optional) A gate that, if met, should not be taken into consideration.
     */
    connectControls (ignored) {
        this.#updateColumns();
        // discard previously drawn connectors
        const oldControlLines = document.querySelectorAll('.control-wire');
        oldControlLines.forEach(line => {canvas.removeChild(line)});

        // parse all existing columns and check if they contain at least one control-ly gate and at least one
        // non-special gate (speciality is subjective, i.e. identities shouldn't be connected with controls).
        for (let col = 0; col < this._columns; col++) {
            let [start, end, hasControl, hasGeneric] = this.testForControlConnectivity(col, ignored);
            // if all tests are positive, draw the line
            if (start > -1 && end > -1 && hasControl && hasGeneric) this.drawConnectorLine(col, start, end, 'control-wire');
        }
    }
    /**
     * Scans the register for columns that contain a pair of swap gates and connects them.
     * It connects only the first, smallest pair encountered and ignores the rest.
     * It refreshes old connections, meaning it deletes previously drawn lines and starts
     * from the beginning.
     * @param {*} ignored (Optional) A gate that, if met, should not be taken into consideration.
     */
    connectSwaps (ignored) {
        this.#updateColumns();
        // discard previously drawn swap lines
        const oldSwapLines = document.querySelectorAll('.swap-wire');
        oldSwapLines.forEach(line => {canvas.removeChild(line)});

        // find the first couple of swap gates in a column and connect them
        for (let col = 0; col < this._columns; col++){
            let [start, end, swapAmount] = this.testForSwapConnectivity(col, ignored);
            if (start > -1 && end > -1 && start < end && swapAmount === 2) this.drawConnectorLine(col, start, end, 'swap-wire');
        }
    }
    /**
     * Tests the given column for swap connectivity. A column has swap connectivity if it contains at least one
     * pair of swap gates. Only the first pair encountered is taken into consideration.
     * @param {*} col The column to test.
     * @param {*} ignored (Optional) A gate that, if met, should not be taken into consideration.
     * @returns Start/End indeces for the swap pair and the potential line.
     */
    testForSwapConnectivity (col, ignored) {
        const swapGates = [];

        for (let i = 0; i < this._qubits.length; i++) {
            if (col >= this._qubits[i].weight || this._qubits[i].gates[col] === ignored) continue;

            const gate = this._qubits[i].gates[col];
            if (gate.type === 'swapGate') swapGates.push(i);
        }

        let start = -1, end = -1;
        if (swapGates.length > 0) start = swapGates[0]; 
        if (swapGates.length > 1) end = swapGates[1];
        
        return [start, end, swapGates.length];
    }
    /**
     * Tests the given column for control connectivity. A column has control connectivity if it has
     *  at least one control-ly gate and at least one generic gate (subjective). 
     * @param {*} col The column to test.
     * @param {*} ignored (Optional) A gate that, if met, should not be taken into consideration.
     * @returns Flags for the connectivity tests and start/end indeces for the potential line.
     */
    testForControlConnectivity (col, ignored) {
        let start = -1, end = -1, hasControl = false, hasGeneric = false;

        for (let i = 0; i < this._qubits.length; i++) {
            if (col >= this._qubits[i].weight || this._qubits[i].gates[col] === ignored) continue;

            // test each qubit of the column for the above
            const controlTest = controllyGates.includes(this._qubits[i].gates[col].type);
            const genericTest = !nongenericGates.includes(this._qubits[i].gates[col].type);
            if (controlTest) hasControl = true;
            else if (genericTest) hasGeneric = true;
            // record the positions of the first and last gates in the column that are generic
            if (start > -1 && genericTest) end = i; 
            else if (start < 0 && genericTest) start = i;
        }
        return [start, end, hasControl, hasGeneric];
    }
    /**
     * Draws a vertical line from wire position col of qubit number start to wire position col of qubit number end.
     * 
     * @param {*} col The column this line should exist in, measured in wire indeces.
     * @param {*} start The starting qubit's index.
     * @param {*} end The final qubit's index.
     * @param {String} type The vertical line's css class type (control-wire, swap-wire).
     */
    drawConnectorLine (col, start, end, type) {
        if (!connectorTypes.includes(type)) {
            console.log('Error: wrong class type passed in drawConnectorLine');
            return;
        }

        const controlWire = document.createElement('div');

        controlWire.className = type;
        controlWire.id = type + col + start + end;
        controlWire.style.left = (col + 5.61) * Constants.GATE_DELIMITER + 'px';
        controlWire.style.top = Constants.TOP_BOUNDARY + (1 + 2 * start) * Constants.WIRE_HALF_ORBIT + Constants.BLANK_SPACE + 'px';
        controlWire.style.height = (end - start) * 50 + 'px';
        canvas.appendChild(controlWire);
    }
    /**
     * Draws correct register rectangles around the kets of the existing qubits
     * according to their specified color. Neighboring ket borders become
     * unified into one. Color shuffles in order by right-clicking the ket.
     */
    updateRegisterBorders() {
        const mainContainer = document.getElementById('mainContainer');
        // remove all previous borders
        for (const regBorder of document.querySelectorAll('.register-border'))
            mainContainer.removeChild(regBorder);

        let currentColor = null, regBorder = null;

        for (const qubit of this.qubits) {
            // while the color among serial qubits doesnt change, increase length of reg
            if (qubit.registerColor === currentColor){
                // '5/3' magic ratio to encapsulate the entirety of the next ket.
                regBorder.style.height = parseInt(regBorder.style.height) + qubit.state.clientHeight * 5 / 3 + 'px';
                continue;
            }
            // the color changed and the register holds at least one ket, draw to screen
            if (regBorder)
                mainContainer.appendChild(regBorder);

            // new color, initialize new register rectangle
            if (qubit.registerColor === '' || qubit.registerColor) {
                regBorder = document.createElement('div');
                regBorder.className = 'register-border';
                // '10' magic number to align the top of the reg border to the top of
                // the starting ket.
                regBorder.style.top = qubit.state.getBoundingClientRect().top - 10 + 'px';
                regBorder.style.height = qubit.state.clientHeight + 'px';
                regBorder.style.width = qubit.state.clientWidth + 'px';
                regBorder.style.border = qubit.registerColor ? `2px solid ${qubit.registerColor}` : '';
                currentColor = qubit.registerColor;
            }
            // unrecognized color, do nothing
            else {
                currentColor = null;
                regBorder = null;
            }
        }
        // add any remaining reg rectangles
        if (regBorder) mainContainer.appendChild(regBorder);
    }
    /**
     * Wipes the current circuit layout and builds a new one, as 
     * described from the given template object.
     * @param {object} template The new circuit layout in object format.
     */
    buildFromTemplate (template) {
        // wipe the existing circuit
        this.empty();
        Gate.resetCounters();

        // summon as many qubit wires as needed
        for (let i = 0; i < template.length - Constants.STARTING_QUBITS; i++) 
            this.appendQubit();

        for (let i = 0; i < template.length; i++) {
            // update state and color for ket
            this._qubits[i].state.textContent = template[i].state;
            this._qubits[i].registerColor = template[i].color;
            
            for (const gate of template[i].gates.reverse()){
                // for each qubit wire, attach each copy gate back-to-front.
                // this is necessary because the copies spawn on the left side of the screen
                // and thus attachGate knows to shift right to prepend the gate to the left.
                const parts = gate.split('<!@DELIMITER>');
                const copy = new Gate(document.getElementById(parts[0]));
                this._qubits[i].attachGate(copy);

                // write the power of the gate in the input box if that applies
                const powerBox = copy.body.querySelector('.textbox');
                if (powerBox && parts.length > 1) {
                    powerBox.value = parts[1];
                    powerBox.style.pointerEvents = 'auto';
                }
                
                // remove the border from gates with custom texture
                if(['xGate', 'swapGate', 'controlGate', 'anticontrolGate'].includes(copy.type))
                    copy.banishBorder();

                // feed dragNdrop behavior to new gates
                copy.body.addEventListener('mousedown', () => {
                    Behaviors.handleDragNdrop(copy);
                });
                copy.hasDragNdrop = true;
                // feed fast delete
                copy.body.addEventListener('contextmenu', (event) => { 
                    Behaviors.fastDeleteGate(event, copy)
                });
            }
        }
        this.minimize();
    }
    /**
     * Builds an object element, containing sub-objects representing the 
     * qubits of the current state in strigifiable format.
     * qubit[i] -> i: {state: qubit[i].state, color: qubit[i].registerColor, gates: qubit[i].gates}
     * @returns The super-object containing all the current state information.
     */
    makeTemplate () {
        const template = {};
        template.length = 0;

        for (let i = 0; i < this._qubits.length; i++) {
            // collect all gates as strings
            const gates = [];
            for (const gate of this._qubits[i].gates) {
                let stamp = gate.type;
                // include the specified power of the gate if that applies
                const powerBox = gate.body.querySelector('.textbox');
                if (powerBox && powerBox.value) stamp += '<!@DELIMITER>' + powerBox.value; 
                gates.push(stamp);
            }
            // add relevant qubit information to template slot
            template[i] = { state: this._qubits[i].state.textContent,
                            color: this._qubits[i].registerColor,
                            gates: gates};
            template.length++;
        }
        return template;
    }
    /**
     * Reverts to the immediate previous saved circuit state.
     * Acts as an undo function.
     * Saves the current state into the redo stack before replacing.
     */
    loadPreviousSnapshot () {
        const prev = undoStack.pop();
        if (prev) {
            redoStack.push(this.makeTemplate());
            this.buildFromTemplate(prev);
        }
    }
    /**
     * Continues to the immediate next saved circuit state.
     * Acts as a redo function.
     * Saves the current state into the undo stack before replacing.
     */
    loadNextSnapshot () {
        const next = redoStack.pop();
        if (next) {
            undoStack.push(this.makeTemplate());
            this.buildFromTemplate(next);
        }
    }
    /**
     * Saves the current circuit state into
     * the undo stack for later use.
     */
    saveSnapshot () {
        // if the undo stack is empty and a new action was taken,
        // flush the redo stack to remove garbage.
        if (undoStack.length === 0) redoStack = [];
        undoStack.push(this.makeTemplate());
    }
    /**
     * Tests all powered gates for valid exponents. A valid exponent
     * contains only arithmetical operations.
     * @returns True if no exponents where found containing NaN.
     */
    checkExponentsOnGates () {
        for (const qubit of this._qubits)
            for (const gate of qubit.gates)
                if (poweredGates.includes(gate.type))
                    try{
                        math.evaluate(gate.body.querySelector('.textbox').value);
                    }
                    catch (error) {
                        return false;  
                    }  
 
        return true;
    }
    static getControllyGates () {
        return controllyGates;
    }
    static getNongenericGates () {
        return nongenericGates;
    }
}

export { Circuit };