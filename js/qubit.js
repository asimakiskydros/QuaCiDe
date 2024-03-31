import * as Constants from './constants.js';
import * as Elements  from './elements.js';
import { Gate }       from './gate.js';
import { circuit }    from './main.js';

const borderColors = ['', 'black', 'purple', 'red', 'orange', 'green'];
const defaultStates = ['|0〉', '|1〉', '|+〉', '|-〉', '|+j〉', '|-j〉'];

class Qubit {
    /**
     * Qubit constructor
     * @param {number} id qubit's number
     * @param {number} topPixels top boundary for painting in HTML
     */
    constructor (id, topPixels) {
        this._gates = [];
        this._bitPositions = '';
        this._registerColor = '';
        this._body = Elements.templateQubit.cloneNode(true);
        this._body.id = 'qubit' + id;
        this._body.style.top = topPixels + 'px';
        this._body.style.display = 'flex';
        this._wire = this._body.querySelector('qubit-wire');
        this._state = this._body.querySelector('qubit-state');

        this._state.addEventListener('click', (e) => {
            circuit.saveSnapshot();

            // add state shuffling when clicking state
            if (!e.ctrlKey) {
                if (e.shiftKey)
                    // shift reverts to default
                    this._state.textContent = defaultStates[0];
                else {
                    const argstate = defaultStates.indexOf(this._state.textContent);
                    this._state.textContent = `${defaultStates[(argstate + 1) % defaultStates.length]}`;
                }
                return;
            }

            // add ket coloring when control-clicking state
            if (e.shiftKey)
                // shift reverts to default
                this._registerColor = borderColors[0];
            else {
                const argcolor = borderColors.indexOf(this._registerColor);
                this._registerColor = borderColors[(argcolor + 1) % borderColors.length];
            }
            circuit.updateRegisterBorders();
        });

        // qubit option '+' adds a new qubit immediately above
        // qubit option 'x' deletes the parent qubit and all its gates
        for (const option of this._body.querySelectorAll('.qubit-option'))
            switch (option.textContent) {
                case '+':
                    option.addEventListener('click', () => { circuit.prependQubit(circuit.argfindQubit(this)); });
                    break;
                case 'x':
                    option.addEventListener('click', () => { circuit.removeQubit(this); });
                    break;
            }
    }
    // getters
    get body () {
        return this._body;
    }
    get wire () {
        return this._wire;
    }
    get state () {
        return this._state;
    }
    get weight () {
        return this._gates.length;
    }
    get gates () {
        return this._gates;
    }
    get empty () {
        return (
            this.weight < 1
            ||
            this._gates.every(element => element.type === 'identityGate')
        );
    }
    get registerColor () {
        return this._registerColor;
    }
    get bitPositions () {
        return this._bitPositions;
    }
    static get defaultStates () {
        return defaultStates;
    }
    // setters
    set registerColor (color) {
        this._registerColor = color;
    }
    /**
     * Glue the given gate on the wire's given position, independent of context.
     * @param {*} gate The inserted gate.
     * @param {*} position The wire's position (index-like).
     */
    snapOnWirePosition (gate, position) {
        // when hovering a qubit, append it inside its body, albeit temporarily,
        // to ensure correct positional alignment.
        if (!this._body.contains(gate.body)) this._body.appendChild(gate.body);

        gate.body.style.top = '-4px';
        gate.body.style.left = (position + 1.5) * Constants.GATE_DELIMITER + 'px';
    }
    /**
     * Determine whether this qubit wire is currently being hovered by the cursor.
     * @param {*} e The mouse event that triggered this behavior.
     * @returns True if the cursor's "rectangle" is inside the qubit container.
     */
    isHovered (e) {
        const containerRect = this._body.getBoundingClientRect();
        return (
            containerRect.top <= e.clientY 
            &&
            containerRect.bottom >= e.clientY
            &&
            containerRect.left < e.clientX
        );
    }
    /**
     * Redraws all gates currently in the gate array such that gate_i exists in qubit position i.
     * @param {*} start The starting index to begin redrawing.
     */
    reorder (start) {
        for (let i = start; i < this._gates.length; i++) {
            if (this._gates[i].type === 'identityGate') continue;
            this.snapOnWirePosition(this._gates[i], i);
        }
        this.scanForMeasurement();
    }
    /**
     * Search the wire for measurement gates. If one is found, turn the qubit into a bit.
     * @param {*} ignored (Optional) A gate that, if met, should not be taken into consideration.
     */
    scanForMeasurement (ignored) {
        // revert to standard wire
        this._wire.style.background = 'black';
        this._wire.style.borderImage = 'none';

        // search for a measurement gate
        for (let i = 0; i < this._gates.length; i++){
            if (ignored === this._gates[i]) continue;
            if (this._gates[i].type === 'measurementGate') {
                // take into consideration only the first one. 
                // Subsequent measurement gates have no effect on the wire style.
                this.turnToBit(i);
                return;
            }
        }
        // if no measurement gates were found, clean the bitposition lookup
        // in case of leftover elements.
        this._bitPositions = '';
    }
    /**
     * Turn the qubit wire to double from given position onward.
     * @param {*} pos The starting position to change the style.
     */
    turnToBit (pos) {
        // translate position to pixels
        const pivot = (pos + 0.5) * Constants.GATE_DELIMITER;

        // change wire style
        this._wire.style.background = `linear-gradient(to right, black ${pivot}px, white ${pivot}px)`;
        this._wire.style.borderImage = `linear-gradient(to right, white ${pivot}px, black ${pivot}px) 1`;

        // inform lookup of new qubit-bit positions
        this._bitPositions = ''
        for (let i = 0; i < this.weight + 1; i++) this._bitPositions += i <= pos ? 'q' : 'b';
    }
    /**
     * Informs whether the qubit has collapsed at given position.
     * If the given index is larger than the length, it is assumed the current bitPositions string
     * continues with the last element ad infinitum.
     * @param {*} pos The position of the qubit to test.
     * @returns True if the position is valid and the wire is double on it.
     */
    isPositionBit (pos) {
        const index = pos < this._bitPositions.length ? pos : -1;
        return this._bitPositions.at(index) === 'b';
    }
    /**
     * Returns the index the given gate occupies on this qubit.
     * @param {*} gate The gate to indecize.
     * @returns Index-like integer if found; null otherwise.
     */
    argfindGate (gate) {
        for (let i = 0; i < this.weight; i++) if (this.gates[i] === gate) 
            return i;

        return null;
    }
    /**
     * Attach the given gate to this wire, shifting the current gate layout as needed.
     * @param {*} gate The gate to be attached.
     * @param {*} pos The desired index the gate is going to be positioned.
     * @param {boolean} override Pass true to discard any previously placed gate on the given position.
     *                           False shifts all gates past the given position to the right and then places.
     */
    attachGate (gate, pos, override) {
        // transfer ownership to this qubit
        gate.owner = this._body.id;
        // pad the qubit with as many identities as necessary to reach the desired position
        if (!override) while (pos > this.weight) this._gates.splice(pos, 0, new Gate(Elements.identityGate));
        // add gate to array at index pos
        this._gates.splice(pos, override ? 1 : 0, gate);
        // reorganize gate train so each gate appears on its corresponding index position
        this.reorder(0);
    }
    /**
     * Detach the given gate from this wire.
     * 
     * If the given gate doesn't exist on the wire, nothing happens.
     * @param {*} gate The gate to be detached.
     * @returns The detached gate's index in the wire, or -1 if the gate wasn't found in the array.
     */
    detachGate (gate) {
        // find the given gate's index on the wire
        for (let pos = 0; pos < this._gates.length; pos++)
            if (this._gates[pos] === gate) {
                // remove the gate and leave a phantom identity gate in its place
                // if this turns out to be unnecessary, it will be collected by 
                // the minimizer
                this._gates.splice(pos, 1);
                if (gate.type !== 'identityGate') this._gates.splice(pos, 0, new Gate(Elements.identityGate));
                // reorganize the gate train
                this.reorder(0);
                return pos;
            } 
        return -1;
    }
    /**
     * Remove all gates from this qubit.
     */
    clear () {
        for (const gate of this._gates) gate.erase(); 

        this._gates = [];
        this.scanForMeasurement();
    }
}

export { Qubit };