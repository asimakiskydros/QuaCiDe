import { Circuit } from "./circuit";
import { Gate } from "./gates";

type Options = {
    endianness?: boolean,
    minQubits?:  boolean,
    shots?:      boolean,
    states?:     boolean,
    aliases?:    boolean,
    colors?:     boolean,
    stacks?:     boolean
};

/**
 * A compression of a circuit instance, to be saved and re-applied elsewhere.
 */
export class Template {
    private readonly collection: Record<string, any>; // the master record containing all important info for the circuit instance

    /**
     * @param circuit The circuit instance to make a template for.
     * @param save What information to keep from this circuit (by default it saves everything).
     */
    constructor (circuit: Circuit, save?: Options) {
        this.collection = { length: circuit.qubits.length, };

        // save instance-wide information if requested
        if (save?.endianness !== false)  this.collection['endianness'] = circuit.endianness;
        if (save?.minQubits  !== false)  this.collection['minQubits'] = circuit.minQubits;
        if (save?.shots      !== false)  this.collection['shots'] = circuit.shots;
        if (save?.stacks     !== false) {
            this.collection['undos'] = [...circuit.undoStack];
            this.collection['redos'] = [...circuit.redoStack];
        }

        // save all requested information for each qubit in the instance
        for (const [i, qubit] of circuit.qubits.entries()) {
            this.collection[`q${i}`] = { gates: qubit.gates.map(gate => gate.stamp), };

            if (save?.states  !== false) this.collection[`q${i}`]['state'] = qubit.state.textContent;
            if (save?.colors  !== false) this.collection[`q${i}`]['color'] = qubit.registerColor;
            if (save?.aliases !== false) this.collection[`q${i}`]['alias'] = qubit.alias;
        }
    }

    /**
     * Applies this `Template` to the given `Circuit` object. It wipes anything left inside it,
     * as it is assumed to be garbage.
     * 
     * @param circuit The `Circuit` object to apply this template to.
     * @param preserve What information to preserve on this circuit (by default it preserves nothing).
     */
    public applyTo (circuit: Circuit, preserve?: Options): void {
        // discard all the previous qubits (this old template is assumed saved elsewhere)
        while (circuit.qubits.length > 0) 
            circuit.removeQubit();

        // add as many qubits as this new template dictates
        for (let i = 0; i < this.collection.length; i++)
            circuit.addQubit();

        // customize every qubit in order according to the saved template
        for (const [i, qubit] of circuit.qubits.entries()) {
            const qubitRecord = this.collection[`q${i}`];

            if (qubitRecord.state && !preserve?.states)  qubit.state.textContent = qubitRecord.state;
            if (qubitRecord.color && !preserve?.colors)  qubit.registerColor = qubitRecord.color;
            if (qubitRecord.alias && !preserve?.aliases) qubit.alias = qubitRecord.alias;

            // create the new gates and attach them so they render properly
            for (const [j, stamp] of this.collection[`q${i}`].gates.entries()) {
                // ignore support gates, they will get placed automatically
                if (stamp.startsWith('supp:')) continue;

                circuit.attach(Gate.from(stamp, circuit)!, i, j);
            }
        }

        // update stacks if saved
        if (this.collection.undos && !preserve?.stacks) circuit.undoStack = [...this.collection.undos];
        if (this.collection.redos && !preserve?.stacks) circuit.redoStack = [...this.collection.redos];

        // update circuit specific settings
        if (this.collection.endianness && !preserve?.endianness) circuit.endianness = this.collection.endianness;
        if (this.collection.minQubits && !preserve?.minQubits) circuit.minQubits = this.collection.minQubits;
        if (this.collection.shots && !preserve?.shots) circuit.shots = this.collection.shots;

        // ensure that the loaded circuit follows the current imaginary unit specification
        for (const qubit of circuit.qubits) qubit.shuffleState(undefined, 0);

        // refresh to save changes
        circuit.refresh();
    }

    /**
     * Collects all records into a single JSON formatted string.
     * @returns A `string` in JSON format containing all recorded info.
     */
    public json () {
        return JSON.stringify(this.collection);
    }

    /**
     * Compares this `Template` with another, given `Template`. It does a deep
     * comparison, meanining it looks for identity in qubits, gates placements, registers,
     * borders, everything.
     * @param other The other `Template` object to compare `this` to.
     * @returns `true` if the two `Template` objects are exactly the same, `false` otherwise.
     */
    public equals (other: Template): boolean {
        return this.json() === other.json();
    }
}