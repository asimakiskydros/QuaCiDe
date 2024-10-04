import { Control, Gate, InertiaGate, Measurement, Support, SWAPGate } from "./gates";
import { Qubit } from "./qubit";
import { Template } from "./template";

export const STEP_SIZE = parseFloat(getComputedStyle(document.body).getPropertyValue('--gate-side')) + 10;

/**
 * Quantum Circuits hold qubits and the gates that affect their state.
 */
export class Circuit {
    public readonly qubits: Qubit[];     // the qubit list of the circuit; the register
    public readonly canvas: HTMLElement; // the HTML element center-stage to spawn the qubits in
    public undoStack: Template[];        // record of previous circuit instances
    public redoStack: Template[];        // record of undone circuit instances
    public endianness: string;           // the current endian order of the circuit
    public minQubits: number;            // the current minimum amount of qubits this register can have
    public shots: number;                // the current times to repeat this experiment during execution
    private readonly minWireWidth;       // the minimum width of the HTML wire element of the qubits
    private readonly minStateWidth;      // the minimum width of the HTML state element of the qubits

    constructor () {
        this.qubits = [];
        this.canvas = $('circuit-canvas').get(0)!;
        this.undoStack = [];
        this.redoStack = [];
        this.endianness = 'Little';
        this.minQubits = 1;
        this.shots = 10000;

        for (let i = 0; i < this.minQubits; i++) this.addQubit();        

        this.minWireWidth = parseFloat($(this.qubits[0].wire).css('min-width'));
        this.minStateWidth = this.qubits[0].state.clientWidth;
    }

    /**
     * Counts and returns the number of active steps.
     */
    private get columns (): number {
        return this.qubits.length > 0 ? Math.max(...this.qubits.map(qubit => qubit.gates.length)) : 0;
    }

    /**
     * Returns whether the current circuit instance contains no gates.
     */
    private get empty (): boolean {
        for (const qubit of this.qubits) 
            if (qubit.gates.length > 0) return false;

        return true;
    }

    /**
     * Returns the `Qubit` at position `index`. Works for the range [-length, length).
     * Negative indeces means going backwards from the last entry.
     * @param index The position of the `Qubit` entry to return.
     * @returns A `Qubit` object if the given `index` is in-bounds; `null` if not or the `index` is a non-integer.
     */
    public qubit (index: number): Qubit | null {
        if (!Number.isInteger(index) || this.qubits.length === 0) 
            return null;
        if (0 <= index && index < this.qubits.length) 
            return this.qubits[index];
        if (-this.qubits.length <= index && index < 0) 
            return this.qubits[this.qubits.length + index];

        return null;
    }

    /**
     * Arg-searches the given `qubit`, or the `Qubit` that is being hovered according
     * to the given `event`.
     * 
     * `qubit` is prioritized if given.
     * @param qubit The `Qubit` object to search.
     * @param event The `MouseEvent` that specifies the hovered `Qubit` to find.
     * @returns The index of the specified `Qubit`, if found; `null` otherwise.
     */
    public find (qubit?: Qubit, event?: JQuery.MouseEventBase): number | null {
        for (let i = 0; i < this.qubits.length; i++)
            if (this.qubits[i] === qubit ||    // is this qubit the same as the given reference?
                this.qubits[i].hovered(event)  // is this qubit the one being hovered currently?
            ) 
                return i;

        return null;
    }

    /**
     * Saves the current circuit instance as a `Template` snapshot, or the given `snapshot`, in the undo stack.
     * @param snapshot If passed, this `Template` instance is saved instead, unless identical to the current instance.
     * @returns `true` if the save was successful.
     */
    public save (snapshot?: Template): boolean {
        const current = new Template(this, { stacks: false, });

        // ignore if the given snapshot is the exact same as the current layout
        if (snapshot && current.equals(snapshot)) return false;
        // flush the redo stack if action is taken with an empty undo stack
        if (this.undoStack.length === 0) this.redoStack = [];
        // if not given a snapshot, save the current layout
        this.undoStack.push(snapshot || current);

        return true;
    }

    /**
     * Loads and applies the specified saved snapshot.
     * @param which `previous` saves the last saved snapshot in the undo stack. 
     *              `next` saves the last saved snapshot in the redo stack. Defaults to `previous`.
     * @returns `true` if the load was successful.
     */
    public load (which: 'previous' | 'next' = 'previous'): boolean {
        // snatch the correct stack's next-in-line template, based on context
        const template = (which === 'previous' ? this.undoStack.pop() : this.redoStack.pop());

        if (!template) return false;

        // apply new template and save the old one to the other stack
        (which === 'next' ? this.undoStack : this.redoStack).push(new Template(this, { stacks: false, }));
        template.applyTo(this);

        return true;
    }

    /**
     * Adds a `qubit` to the register in the appropriate position.
     * @param qubit If specified, `index` must also be specified and this `qubit` is inserted to that position in the register.
     * @param index If not specified, and no `qubit` is given, spawns a new `Qubit` at the end of the register.
     */
    public addQubit (qubit?: Qubit, index: number = -1): void {
        // if not specified a qubit, create a fresh one filled with as many inertias
        // as there are columns
        const actual = qubit || new Qubit(this, this.columns);
        
        // if not given a qubit, create a new one at the end of the register
        if (!qubit) {
            this.qubits.push(actual);
            // the template qubit is invisible. Placing the new qubit before it essentially makes it the "last".
            // The template being invisible and in the true end is useful as it allows for further vertical
            // scrolling during overflow.
            $('#template-qubit').before(actual.body);
        }
        // if given, change its position in the register
        else if (-1 < index && index < this.qubits.length) {
            this.qubits.splice(index, 0, actual);
            $(this.qubits[index].body).before(actual.body);
        }

        this.updateToolbarWidgets();
    }

    /**
     * Removes a `qubit` from the register.
     * @param qubit If specified, finds and removes it from its position in the register.
     * @param index If specified, it removes the qubit at that position. If not, it removes the last `Qubit`
     *              in the register.
     */
    public removeQubit (qubit?: Qubit, index: number = -1): void {        
        if (!qubit && index === -1)
            // if not specified, remove last qubit
            this.qubits.pop()?.clear(true);
        else if (qubit || -1 < index && index < this.qubits.length)
            // remove the qubit and shift the rest of the qubit list once to the left
            this.qubits.splice(
                (qubit ? this.find(qubit) : index)!,
                1
            )[0].clear(true);

        this.updateToolbarWidgets();
    }

    /**
     * Attaches the given `gate` on the specified qubit wire at the specified `position`.
     * @param gate The `Gate` object to attach.
     * @param row The index of the `Qubit` object to attach `gate` to.
     * @param position The index at which to attach the `gate` on the qubit wire.
     * @returns `true` if the attachment was successful.
     */
    public attach (gate: Gate, row: number, position: number): boolean {
        if (row < 0 || row >= this.qubits.length) return false;

        // map the given position to the correct column.
        // if it is further than the rightmost placed gate in the circuit, default
        // to the end of the circuit.
        // else, if not an integer, default to the next column in line and 
        // push the existing step once to the right
        const col = Math.ceil(Math.min(position, this.columns));
        // if the given position is decimal, push the rest of the circuit once to the right
        // by spawning a pillar of identites. If not, fill the column with identities in void places only.
        for (const qubit of this.qubits) 
            if (!Number.isInteger(position) || !qubit.gate(col))
                qubit.attach(new InertiaGate(this), col);
        // add the gate, replacing the existing one on the calculated position only
        // if it is an identity
        this.qubits[row].attach(
            gate, 
            col, 
            this.qubits[row].gate(col) instanceof InertiaGate
        );
        // spawn support gates underneath it in case it has span
        for (let i = 1; i < gate.span; i++) {
            while (row + i >= this.qubits.length) this.addQubit();

            this.attach(new Support(gate, this), row + i, col);
        }
        return true;
    }

    /**
     * Detaches the given `gate` from its `Qubit` owner.
     * @param gate The `Gate` to detach.
     * @returns `true` if the detachment was successful.
     */
    public detach (gate: Gate): boolean {
        if (!gate.owner) return false;

        // detach the given gate if found
        const index = gate.owner.detach(gate)!;
        // if it spanned multiple qubits, erase leftover supports
        if (gate.span > 1) 
            for (const qubit of this.qubits)
                if (qubit.gate(index)?.type === `supp:${gate.body.id}`)
                    qubit.detach(qubit.gates[index], true);

        return true;
    }

    /**
     * Translates the document coordinates of the mouse into the relative position
     * of the (assumed dragged) given `gate` in the hovered `Qubit`, if any.
     * @param event The `MouseEvent` that specifies the movement of the mouse.
     * @param gate The dragged `Gate`.
     * @returns The translated relative position and the index of the hovered `Qubit`, if found; `null` and `null` otherwise.
     */
    public localize (event: JQuery.MouseEventBase, gate: Gate): [number, number] | [null, null] {
        const hovered = this.find(undefined, event); // locate the hovered qubit

        if (hovered === null) return [null, null]; // if not hovering a qubit, return early

        const hQubit = this.qubits[hovered];
        // find the offset of the mouse position to the leftside of the hovered qubit's wire
        const offset = event.clientX - hQubit.wire.getBoundingClientRect().left;
        // if negative, that means the mouse is left of the wire element and thus it is not hovering it
        if (offset <= 0) return [null, null]; 
        // digitize the offset according to the space each step consumes to calculate the hovered index
        const index = Math.floor(offset / STEP_SIZE); 
        
        let shadows = false;
        // for multiple-qubit-spanning gates, test whether the index column shadows already placed gates
        if (gate.span > 1) 
            for (let i = hovered + 1; i < hovered + gate.span && !shadows; i++) {
                if (i >= this.qubits.length) break;

                const other = this.qubits[i].gate(index);
                // ignore invisible gates
                if (other && !(other instanceof InertiaGate || other instanceof Support)) 
                    shadows = true;
            }

        const resident = hQubit.gate(index);
        // to force a right-shift in the circuit, fall back to the previous decimal if: 
        return [
            // 1. the cursor is below the mean of the offset range that maps to this index
            // this means that the user is hovering in-between steps and is asking to create a new step
            offset < (index + 0.5) * STEP_SIZE || 
            shadows || (                                    // OR 2. the hovered gate shadows over existing gates in this step
                resident && !(                              // OR 3. the existing gate in this position:
                    resident instanceof InertiaGate      || // is not an identity
                    resident.type.includes(gate.body.id) || // neither is a support gate of the hovered gate
                    resident === gate                       // nor is it the hovered gate itself
                ))
            ? index - 0.5 : index, hovered
        ];   
    }

    /**
     * Sets the width of the qubits according to the number of `columns` + the given surplus.
     * @param surplus How much extra to extend the width after #`columns`.
     */
    public extend (surplus = 0): void {
        const cols = this.columns;
        surplus = Math.floor(Math.max(surplus, 0)); // round to the nearest non-negative integer

        for (const qubit of this.qubits)
            $(qubit.wire).css(
                'min-width', 
                `${this.minWireWidth + (cols > 0 ? (cols + surplus) * (10 + 40) : 0)}px`
            );          
    }

    /**
     * Enables/disables toolbox buttons based on context given by the active circuit trackers.
     */
    public toggleButtons (): void {
        const empty = this.empty;

        $('.add-custom')
            .prop('disabled', Gate.errors > 0 || Gate.measurements > 0 || Gate.generics + Gate.swaps === 0)
            .attr('title',
            Gate.errors > 0 ? 
                'The circuit has errors.':
            Gate.measurements > 0 ? 
                'Nesting measurements is prohibited.':
            Gate.generics + Gate.swaps === 0 ? 
                'The circuit is empty.':
                'Add custom gate (CTRL + A)');
        $('#undo')
            .prop('disabled', this.undoStack.length === 0)
            .attr('title',    this.undoStack.length === 0 ? 'No actions to revert.' : 'Undo (CTRL + Z)');
        $('#redo')
            .prop('disabled', this.redoStack.length === 0)
            .attr('title',    this.redoStack.length === 0 ? 'No actions to revert.' : 'Redo (CTRL + Y)');
        $('#clear')
            .prop('disabled', empty)
            .attr('title',    empty ? 'The circuit is empty.' : 'Clear all (CTRL + C)');
        $('#counts')
            .prop('disabled', Gate.measurements === 0 || Gate.errors > 0)
            .attr('title', 
                Gate.errors > 0 ? 
                    'The circuit has errors.':
                Gate.measurements === 0 ? 
                    'At least one measurement needs to be declared.':
                    'Request measurement counts...');
        $('#amplitudes')
            .prop('disabled', Gate.errors > 0)
            .attr('title', Gate.errors > 0 ? 'The circuit has errors.' : 'Request amplitude statevector...');
    }

    /**
     * Calculates and paints control and swap connectors, if applicable.
     * 
     * A control connector is applicable on a column if said column contains at least one
     * 'Control' gate and at least one generic gate (not `Measurement`, `InertiaGate` or `Control`).
     * 
     * A swap connector is applicable on a column if said column contains exactly 2 `SWAPGate` objects.
     * 
     * @param column The column index to pay attention to. If not specified, it will iterate over all of them.
     * @param ignored A `Gate` object to ignore during the calculations (typically the hovered gate).
     */
    public drawConnectors (column?: number, ignored?: Gate): void {
        if (column === undefined) $('connector').remove();

        // if specified a column, test only that given column. Otherwise, test all of them
        for (const col of column !== undefined ? [column] : Array(this.columns).keys()) {
            const controls = [], generics = [], swaps = [];

            // collect the indeces of all controls, generics and swaps in the column
            // (A gate is generic if it is not a `Control`, `Measurement` or `Inertia`)
            for (let i = 0; i < this.qubits.length; i++) {
                const gate = this.qubits[i].gate(col);

                if (!gate || gate === ignored)
                    continue;
                else if (gate instanceof Control)
                    controls.push(i);
                else if (!(gate instanceof Measurement || gate instanceof InertiaGate))
                    generics.push(i);
                if (gate instanceof SWAPGate) 
                    swaps.push(i);
            }
            // for every control in the column, spawn connectors from it to the last generic in both directions
            for (const ctrl of controls) {
                if (generics.length > 0 && generics[0] < ctrl)
                    this.paintConnector(col, generics[0], ctrl, this.qubits[ctrl].bit(col) ? 'classical' : 'quantum');

                if (generics.length > 0 && generics[generics.length - 1] > ctrl)
                    this.paintConnector(col, ctrl, generics[generics.length - 1], this.qubits[ctrl].bit(col) ? 'classical' : 'quantum');
            }
            // if there are controls, apply alternate appearance for applicable gates
            for (const i of generics) this.qubits[i].gate(col)?.alternate(controls.length > 0);
            // if there are exactly two swaps in the step, connect them
            if (swaps.length === 2) this.paintConnector(col, swaps[0], swaps[1], 'swap');
        }
    }

    /**
     * Spawn a connector element spanning the given `column`, starting from `start`th qubit and ending on
     * `end`th qubit in the register. 
     * @param column The step to spawn the connector in.
     * @param start The starting qubit index.
     * @param end The ending qubit index.
     * @param type The CSS style (class) for this connector.
     */
    private paintConnector (column: number, start: number, end: number, type: string): void {
        // magic numbers galore
        const OFFSET_LEFT = 141, OFFSET_TOP = 142, STEP_SIZE = 50, QUBIT_SIZE = 59;

        $(this.canvas).append($('<connector></connector>')
        .css({
            left: `${OFFSET_LEFT + column * STEP_SIZE}px`,
            top: `${OFFSET_TOP + start * QUBIT_SIZE}px`,
            height: `${(end - start) * QUBIT_SIZE}px`})
        .addClass(type));
    }

    /**
     * Calculates and paints postselection borders, if applicable.
     * 
     * Postselection borders are applicable on a column if said column contains
     * at least one `Measurement` gate that has postselection `mode` enabled (`> 0`).
     * @param column The column index to pay attention to. If not specified, it will iterate over all of them.
     * @param ignored A `Gate` object to ignore during calculations (typically the hovered gate).
     */
    public drawBorders (column?: number, ignored?: Gate): void {
        if (column === undefined) $('border').remove();

        const QUBIT_SIZE = 59, OFFSET = 143;

        for (const col of column !== undefined ? [column] : Array(this.columns).keys()) 
            // scan the column for the first measurement
            for (const qubit of this.qubits) {
                const gate = qubit.gate(col);
                // skip `ignored` and non-postselected measurements
                if (gate !== ignored && gate instanceof Measurement && gate.mode !== 2) {
                    // paint a border spanning the entire step
                    $(this.canvas).append($('<border></border>')
                    .css({
                        left:   `${col * STEP_SIZE + OFFSET}px`,
                        height: `${this.qubits.length * QUBIT_SIZE}px`
                    }));
                    break;
                }
            }
    }

    /**
     * Draws register borders for qubit kets according to user selections.
     * Neighboring same-colored ket borders get unified into one.
     */
    public drawRegisters (): void {
        // remove previous elements
        $('register').remove();

        let currentColor: string | null = null, register: JQuery<HTMLElement> | null = null;
        const OFFSET_TOP = 122, BALANCE = 4;

        for (let row = 0; row < this.qubits.length; row++) {
            const qubit = this.qubits[row];
            // so long as neighboring kets have the same color, keep elongating the register
            if (qubit.registerColor === currentColor) {
                register!.height(register!.height()! + qubit.body.clientHeight + BALANCE);
                continue;
            }
            // if the color just changed, add the previous register
            $(this.canvas).append(register!);
            // create new register for the new color
            register = $('<register></register>')
                .css({
                    top: `${OFFSET_TOP + row * (qubit.body.clientHeight + BALANCE)}px`,
                    height: `${qubit.state.clientHeight}px`,
                    width: `${this.minStateWidth / 2}px`,
                    border: `3px solid ${qubit.registerColor}`,
                    borderRight: 'none'
                });
            currentColor = qubit.registerColor;
        }
        // handle any leftover registers
        $(this.canvas).append(register!);
    }

    /**
     * Performs error checking on all placed gates, marking them appropriately.
     * Parses each gate, including `SWAPGate` objects only once.
     * Afterwards, it toggles buttons based on context.
     */
    public validate (): void {
        for (let col = 0, columns = this.columns; col < columns; col++) {
            let doneSwap = false;
            // remove all previous errors
            for (const qubit of this.qubits) 
                qubit.gate(col)?.unerror();
            // validate anew
            for (const qubit of this.qubits) {
                const gate = qubit.gate(col);

                // validate SWAPs on this step only once (one call validates all)
                if (gate instanceof SWAPGate && doneSwap) continue;

                gate?.validate();

                doneSwap = doneSwap || gate instanceof SWAPGate;
            }
        }
        // enable/disable buttons based on context
        this.toggleButtons();
    }

    /**
     * Minimizes the circuit depth and width by removing redundant empty qubits
     * and empty columns.
     */
    public minimize (): void {
        for (let col = 0, columns = this.columns; col < columns; col++) {
            // test column for emptiness
            let empty = true;
            for (const qubit of this.qubits)
                if (col < qubit.gates.length) 
                    empty = empty && (qubit.gates[col] instanceof InertiaGate);
            
            // if empty, remove all its gates
            if (empty) 
                for (const qubit of this.qubits)
                    qubit.detach(qubit.gate(col), true);
        }
        // replenish qubits to reach the minimum if below it
        while (this.qubits.length < this.minQubits)
            this.addQubit();
        // delete surplus of empty qubits if above the minimum
        while (
            this.qubits.length > this.minQubits &&
            this.qubits[this.qubits.length - 1].empty
        )
            this.removeQubit();    
    }

    /**
     * Updates the stat track widgets on the toolbar with the correct current information.
     */
    public updateToolbarWidgets (): void {
        $('#qubits-counter').find('span')
            .text(`Qubits: ${this.qubits.length}`);
            
        $('#gates-counter').find('span')
            .text(`Gates: ${Gate.generics + Math.floor(Gate.swaps)}`);

        $('#steps-counter').find('span')
            .text(`Steps: ${this.columns}`);

        $('#order').find('span')
            .text(`Order: ${this.endianness} Endian`);

        $('#starting-qubits').find('input')
            .val(this.minQubits);
        
        $('#shots').find('input')
            .val(this.shots);
    }

    /**
     * Re-counts the existing qubits according to specified Endian order.
     */
    public updateOrder (): void {
        let index  = this.endianness === 'Little' ? 0 : this.qubits.length - 1;
        const step = this.endianness === 'Little' ? 1 : -1;

        for (const qubit of this.qubits) {
            qubit.placeholder = `q${index}`;
            index += step;
        }
    }

    /**
     * Refreshes the circuit by removing redundancies, drawing control and swap connectors,
     * register and postselection borders, checking for errors, correcting qubit width, 
     * updating toolbar trackers and qubit counting (in that order).
     */
    public refresh (): void {
        this.minimize();
        this.drawConnectors();
        this.drawRegisters();
        this.drawBorders();
        this.validate();
        this.extend();
        this.updateToolbarWidgets();
        this.updateOrder();
    }
}