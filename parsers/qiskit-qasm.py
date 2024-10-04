from qiskit import QuantumCircuit, transpile
from qiskit.circuit.library import XGate, YGate, ZGate, HGate, SGate, TGate
from qiskit_aer import QasmSimulator, StatevectorSimulator
from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
from sympy import sympify
import numpy as np
import json

DELIMITER = '<!@DELIMITER>' 
DEFAULTS  = { 'x': XGate, 'y': YGate, 'z': ZGate, 'h': HGate, 's': SGate, 't': TGate }
CUSTOMS   = {}
POSTSELECTIONS = {}


app = Flask(__name__)
CORS(app)


@app.route('/parser', methods = ['POST'])
@cross_origin()
def parse ():
    """ Receives the JSONL payload, constructs the described circuit
        and returns the specified output.
    """
    data: list[dict] = [json.loads(line) for line in request.get_json().split('\n')]
    CUSTOMS.clear()
    POSTSELECTIONS.clear()

    for i, line in enumerate(data):
        if 0 < i < len(data) - 1:
            # all intermediary definitions are custom gates
            custom_gate = build(line)
            CUSTOMS[f'cg{len(CUSTOMS) + 1}'] = [custom_gate.to_gate, custom_gate.width()]
        if i == len(data) - 1:
            # the final definition is the circuit to execute
            circuit = QuantumCircuit(line.get('length'), line.get('length'))
            circuit = build(line, circuit)
        
    output = data[0].get('output')

    if output == 'counts':     return counts(circuit, data[-1])
    if output == 'amplitudes': return amplitudes(circuit, data[-1])
    if output == 'unitary':    return unitary_matrix(circuit, data[-1])
    if output == 'phases':     return phases(circuit, data[-1])
    if output == 'code':       return source_code(circuit, data[-1])
    
    return '"No such command."', 400


def initialize (circuit: QuantumCircuit, template: dict):
    """ Stitches the initial state of the whole register,
        respecting the specified order.

        **Params**:\n
        `circuit`: The circuit object to initialize.\n
        `template`: The circuit instance to fetch the initial state from (typically the 
        last in the payload).
    """
    def translate (state: str):
        # qiskit format: r == +i, ; l == -i, the others are the same
        if state in ('+i', '+j'): return 'r'
        if state in ('-i', '-j'): return 'l'
        return state
        
    initial_state = ''.join(
        translate(element.get('state')) 
        for element in reversed(template.values())
        if isinstance(element, dict)
    )

    # create a dummy circuit initialized to the desired state, then compose it 
    # in front of the target circuit
    dummy = QuantumCircuit(template.get('length'), template.get('length'))
    dummy.initialize(initial_state)
    circuit.compose(dummy, front=True, inplace=True)


def build (template: dict, circuit: QuantumCircuit = None):
    """ Constructs the `QuantumCircuit` object as specified by the passed `template`.

        **Params:**\n
        `template`: The circuit instance to build.\n
        `circuit`: If passed, the construction will happen in-place, but the same
        object will be returned again.

        **Returns:** A `QuantumCircuit` object holding the specified circuit.
    """
    def unify (gates: list[str]):
        if len(gates) == 0: return None

        step  = QuantumCircuit(len(gates))
        swaps = []

        # place every gate in the order shown in the column
        for i, stamp in enumerate(gates):
            if stamp in DEFAULTS:
                step.append(DEFAULTS[stamp](), [i])
            if stamp.startswith('powered-'):
                kind, repr = stamp.split('powered-')[1].split(DELIMITER)
                power = float(sympify(repr).evalf())  # evaluate the exponent
                step.append(DEFAULTS[kind]().power(power), [i])
            if stamp == 'swap':
                swaps.append(i)
            if stamp in CUSTOMS:                 # jump as many qubits as this gate spans
                step.append(CUSTOMS[stamp][0](), [i + j for j in range(CUSTOMS[stamp][1])])
        
        if len(swaps) == 2:
            # place swaps only if they are a single pair
            # (redundant check as the interface shouldnt allow errors to pass through)
            step.swap(swaps[0], swaps[1])
        
        return step.to_gate()

    # collect the entire circuit as a matrix of gates, rows are qubit gate trains
    gate_matrix = np.array([
        element.get('gates')
        for element in template.values()
        if isinstance(element, dict)
    ])

    if circuit is None: circuit = QuantumCircuit(gate_matrix.shape[0]) 

    for col in gate_matrix.T:
        # unify every column into a single gate, so that any controls present affect the entire step
        control_state = ''.join(el.split(DELIMITER)[1] for el in col if el.startswith('control'))        
        step = unify([el for el in col if not el.startswith(('control', 'measurement', 'inertia'))])

        if control_state: step = step.control(len(control_state), ctrl_state=control_state[::-1])

        if step is not None: 
            circuit.append(step, 
                [i for i, stamp in enumerate(col) if stamp.startswith('control')] + 
                [i for i, stamp in enumerate(col) if not stamp.startswith(('control', 'measurement', 'inertia'))])

        for i, stamp in enumerate(col):
            if stamp.startswith('measurement'):
                # save any specified postselections for the execution phase
                mode = stamp.split(DELIMITER)[1]
                if mode != '2' : POSTSELECTIONS[i] = mode
                circuit.measure(i, i)
    
    return circuit


def counts (circuit: QuantumCircuit, template: dict):
    """ Executes the passed circuit on `QasmSimulator` and returns the
        counts. 

        **Params:**\n
        `circuit`: The circuit object to execute.\n
        `template`: The circuit instance that holds the initial state.

        **Returns:** The `AJAX` response holding the produced counts.
    """
    initialize(circuit, template)

    if template.get('endianness') == 'Big': circuit = circuit.reverse_bits()

    shots: int = template.get('shots', 10000) # default to 10k
    backend = QasmSimulator()
    counts: dict[str, int] = backend.run(transpile(circuit, backend), shots=shots).result().get_counts()

    # apply postselections
    # nullify states that dont conform to the specified mode
    for i, mode in POSTSELECTIONS.items():
        for state, hits in counts.items():
            counts[state] = hits * int(state[::-1][i] == mode)

    return jsonify([{ 'state': state, 'counts': hits } for state, hits in counts.items()])


def amplitudes (circuit: QuantumCircuit, template: dict):
    """ Executes the passed circuit on `StatevectorSimulator` and returns the
        state-amplitude vector.

        **Params:**\n
        `circuit`: The circuit object to execute.\n
        `template`: The circuit instance that holds the initial state.

        **Returns**: The 'AJAX' response holding the produced statevector.
    """
    initialize(circuit, template)
    circuit.remove_final_measurements(inplace=True)

    if template.get('endianness') == 'Big': circuit = circuit.reverse_bits()

    backend = StatevectorSimulator()
    raw_sv: list[complex] = backend.run(transpile(circuit, backend)).result().get_statevector(circuit, 4).data

    # 1st filter: turn array of amps into dict of states to amps, with states in full binary
    statevector = {
        bin(state)[2:].zfill(template.get('length')) : amplitude
        for state, amplitude in enumerate(raw_sv)
    }
    
    # 2nd filter: apply postselections
    # non-conformant states become improbable (amplitude 0)
    for i, mode in POSTSELECTIONS.items():
        for state, amplitude in statevector.items():
            statevector[state] = amplitude * int(state[::-1][i] == mode)
    
    # 3rd filter: renormalize the resulting statevector so the squares add to 1
    norm = np.linalg.norm(list(statevector.values()))
    statevector = { 
        state: amplitude / norm 
        for state, amplitude in statevector.items() 
    }
    
    # 4th filter: split complex numbers into real and imaginary parts, as JS doesn't recognize complex
    return jsonify([{
        'state': state,
        'real' : round(amplitude.real, 4),
        'imag' : round(amplitude.imag, 4) } 
        for state, amplitude in statevector.items()])


def unitary_matrix (circuit: QuantumCircuit, template: dict):
    return '"Not supported yet."', 500


def phases (circuit: QuantumCircuit, template: dict):
    return '"Not supported yet."', 500


def source_code (circuit: QuantumCircuit, template: dict):
    return '"Not supported yet."', 500


if __name__ == '__main__':
    app.run()