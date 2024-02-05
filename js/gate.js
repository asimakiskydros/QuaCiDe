let createdGatesCounter = 0;
let placedMeasurementGates = 0;
let identitiesCounter = 0;

class Gate {
    /**
     * Summon a new gate by copying the given static template.
     * @param {*} other the static HTMLElement clicked in the toolbox.
     * @param {number} id the id number for the new gate.
     */
    constructor (other) {
        this._body = other.cloneNode(true);
        // copy style customization
        this._body.id = 'copyof-' + other.id + '-' + createdGatesCounter++;
        this._body.style.position = 'absolute';
        this._body.style.boxShadow = 'none';

        // summon texture
        document.body.appendChild(this._body);
        const rect = this._body.getBoundingClientRect();

        // save x, y offsets for movement use
        this._offsetX = rect.width / 2;
        this._offsetY = rect.height / 2;

        // save relevant information on flags for later use
        this._hasDragNdrop = false;
        this._owner = 'none';
        this._type = other.id;
        this._errored = false;

        // if this is an identity gate, dont project it at all
        if (this._type === 'identityGate') { 
            this._body.style.display = 'none';
            identitiesCounter++; 
        }
        // if this is a measurement gate, inform counter
        if (this._type === 'measurementGate') placedMeasurementGates++;
    }
    // getters
    get body () {
        return this._body;
    }
    get hasDragNdrop () {
        return this._hasDragNdrop;
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
    static get placedMeasurementGates () {
        return placedMeasurementGates;
    }
    static get identitiesCounter () {
        return identitiesCounter;
    }
    static get gatesCounter () {
        return createdGatesCounter;
    }
    // setters
    set hasDragNdrop (status) {
        this._hasDragNdrop = status;
    }
    set owner (qubitID) {
        this._owner = qubitID;
    }
    set errored (isErrored) {
        this._errored = isErrored;
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
        this.moveLeft(amountX)
        this.moveUp(amountY)
    }
    /**
     * Remove this gate's div from the webpage.
     * If it was a measurement gate, inform the global counter.
     */
    erase () {
        if (this._type === 'measurementGate') placedMeasurementGates--;
        if (this._type === 'identityGate') identitiesCounter--;
        createdGatesCounter--;
        this._body.remove();
    }
    /**
     * Hide gate border and background.
     * Useful for gates with unique png-like textures, like Pauli X.
     */
    banishBorder () {
        this._body.style.backgroundColor = 'transparent';
        this._body.style.border = 'none';
    }
    /**
     * Reveal border and background color of gate.
     * Useful for when hovering gates with unique textures.
     */
    summonBorder () {
        this._body.style.backgroundColor = 'white';
        this._body.style.border = '1px solid black';
    }
    static resetCounters () {
        createdGatesCounter = 0;
        identitiesCounter = 0;
        placedMeasurementGates = 0;
    }
}

export { Gate };