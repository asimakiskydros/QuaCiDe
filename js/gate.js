import * as Behaviors from './behaviors.js';
import { circuit } from './main.js';

const iconsDir            = 'media';
const measurementTextures = ['measurement.png', 'post-select-0.png', 'post-select-1.png'];
const measurementLabels   = ['M', 'PS-0', 'PS-1'];
const controlTextures     = ['control.png', 'anticontrol.png'];
const controlLabels       = ['C', 'AC'];

class Gate {
    /**
     * Summon a new gate by copying the given static template.
     * @param {*} other The static HTMLElement clicked in the toolbox.
     * @param {number} qubitSpan (Optional) How many qubits this gate spans.
     */
    constructor (other, qubitSpan = 1) {
        this._span = qubitSpan;
        this._body = other.cloneNode(true);

        // copy style customization
        this._body.id = `${other.id}.${circuit.gatesCounter++}`;
        this._body.style.position = 'absolute';
        this._body.style.boxShadow = 'none';
        this._body.style.height = this._span * 40 + (this._span - 1) * 10 + 'px';

        // summon texture
        document.body.appendChild(this._body);
        const rect = this._body.getBoundingClientRect();

        // save x, y offsets for movement use
        this._offsetX = rect.width / 2;
        this._offsetY = rect.height / 2;

        // save relevant information on flags for later use
        this._owner = 'none';
        this._type = other.id;
        this._errored = false;
        this._powerBox = this._body.querySelector('.textbox');
        this._display = 0;

        // if this is an identity gate, dont project it at all
        if (this._type === 'identityGate') { 
            //this._body.style.display = 'none';
            circuit.identitiesCounter++; 
        }
        // if this is a measurement gate, inform counter
        if (this._type === 'measurementGate') circuit.placedMeasurementGates++;
        // if this is a support gate, inform counter
        if (this._type[0] === '^') circuit.supportGates++;
        // make errored on invalid exponential
        if (this._powerBox)
            this._powerBox.addEventListener('input', () => { Behaviors.handleExponential(this, this._powerBox.value); });

        // remove the border from gates with custom texture               
        this.banishBorder();

        // feed dragNdrop behavior to new gates
        this._body.addEventListener('mousedown', (e) => { 
            if (e.altKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            Behaviors.handleDragNdrop(this); 
        });

        // feed fast delete
        this._body.addEventListener('contextmenu', (e) => { Behaviors.fastDeleteGate(e, this); });

        this._body.addEventListener('click', (e) => { 
            if (e.shiftKey || e.ctrlKey)
                // feed fast copy
                Behaviors.fastCopyGate(e, this); 
            if (e.altKey && this._type === 'measurementGate' && !this._errored) {
                // enforce postselection on measurement
                this._display = Behaviors.changeGateDisplay(e, this, measurementTextures, measurementLabels, iconsDir);
                Behaviors.handlePostSelectionBorder(this);
            }
            else if (e.altKey && this._type === 'controlGate')
                // toggle 0-1 state on control
                this._display = Behaviors.changeGateDisplay(e, this, controlTextures, controlLabels, iconsDir);
        });
    }
    // getters
    get body () {
        return this._body;
    }
    get owner () {
        return this._owner;
    }
    get type () {
        return this._type;
    }
    get errored () {
        return this._errored;
    }
    get stamp () {
        let stamp = this._type;
        if (this._powerBox && this._powerBox.value) 
            stamp += '<!@DELIMITER>' + this._powerBox.value;
        else if (this._type === 'measurementGate' || this._type === 'controlGate')
            stamp += '<!@DELIMITER>' + this._display;
        return stamp;
    }
    get powerBox () {
        return this._powerBox;
    }
    get display () {
        return this._display;
    }
    get span () {
        return this._span;
    }
    static get measurementTextures () {
        return measurementTextures;
    }
    static get measurementLabels () {
        return measurementLabels;
    }
    static get controlTextures () {
        return controlTextures;
    }
    static get controlLabels () {
        return controlLabels;
    }
    static get iconsDir () {
        return iconsDir;
    }
    // setters
    set owner (qubitID) {
        this._owner = qubitID;
    }
    set errored (isErrored) {
        this._errored = isErrored;
    }
    set display (mode) { 
        this._display = mode;
    }
    /**
     * Move this div to 'amount' pixels from the left of the screen.
     * @param {*} amount Left position in pixels to move to.
     */
    moveLeft (amount) {
        this._body.style.left = amount - this._offsetX + 'px';
    }
    /**
     * Move this div to 'amount; pixels from the top of the screen.
     * @param {*} amount Top position in pixels to move to.
     */
    moveUp (amount) {
        this._body.style.top = amount - this._offsetY + 'px';
    }
    /**
     * Move this div to new given coordinates.
     * @param {*} amountX Left position in pixels.
     * @param {*} amountY Top position in pixels.
     */
    move (amountX, amountY) {
        // a gate moves plain if it does not hover a qubit.
        // if it currently belongs inside anything other than the main body,
        // then it was just picked up from a qubit. Return it to the main body.
        if (this._body.parentElement !== document.body) document.body.appendChild(this._body);

        this.moveLeft(amountX)
        this.moveUp(amountY)
    }
    /**
     * Remove this gate's div from the webpage.
     * If it was a measurement gate, inform the global counter.
     */
    erase () {
        if (this._type === 'measurementGate') circuit.placedMeasurementGates--;
        if (this._type === 'identityGate') circuit.identitiesCounter--;
        if (this._errored) circuit.erroredGates--;
        if (this._type[0] === '^') circuit.supportGates--;
        circuit.gatesCounter--;
        this._body.remove();
    }
    /**
     * Hide gate border and background.
     * Useful for gates with unique png-like textures, like Pauli X.
     */
    banishBorder () {
        if(['xGate', 'swapGate', 'controlGate'].includes(this._type)) {
            this._body.style.backgroundColor = 'transparent';
            this._body.style.border = 'none';
            return true;
        }
        return false;
    }
    /**
     * Reveal border and background color of gate.
     * Useful for when hovering gates with unique textures.
     */
    summonBorder () {
        this._body.style.backgroundColor = 'white';
        this._body.style.border = '1px solid black';
    }
    /**
     * Tag this gate as errored and change its border to red.
     * If this gate is already errored nothing happens.
     * Ignore identities.
     * @param title (Optional) Description of error that appears on hover.
     */
    makeErrored (title) {
        if (this._errored || this._type === 'identityGate') return;

        if (title) this._body.title = title;
        this._errored = true;
        this._body.style.backgroundColor = 'white';
        this._body.style.border = '1px solid red';
        circuit.erroredGates++;
    }
    /**
     * Tag this gate as not errored and return its gate to normal.
     * If this gate is not errored nothing happens.
     */
    unmakeErrored () {
        if (!this._errored) return;

        this._errored = false;
        this._body.title = '';
        // re-instate the correct border-background combo
        if (!this.banishBorder()) this.summonBorder();
        circuit.erroredGates--;
    }
}

export { Gate };