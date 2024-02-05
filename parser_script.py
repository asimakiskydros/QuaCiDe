from qiskit import Aer, QuantumCircuit, execute
from qiskit.circuit.library import XGate, YGate, ZGate
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
from fractions import Fraction
import json

# enable request app with CORS header
app = Flask(__name__)
CORS(app)


@app.route('/parser', methods=['POST'])
@cross_origin()
def run_simulation():
    parameters = request.get_json()
    # create quantum circuit out of given template
    measured_qc = extrapolate(parameters.get('template'), parameters.get('initialState'))
    # create a copy with no measurementGates to calculate amps on
    unmeasured_qc = extrapolate(parameters.get('template').replace(',"measurementGate"', ''), parameters.get('initialState'))
    # get counts from measured circuit
    counts = calculate_counts(measured_qc, int(parameters.get('shots')), parameters.get('backend'))
    # get amplitudes from unmeasured circuit
    amps = calculate_amplitudes(unmeasured_qc)
    # calculate probabilities from amplitudes
    probs = np.round(np.abs(amps) ** 2, 4)
    # return results to javascript
    return jsonify({
        'counts': counts,
        'amplitudes': amps.astype(str).tolist(),
        'probabilites': probs.tolist()
    })


def calculate_counts(circuit: QuantumCircuit, shots: int, pref_backend: str = 'qasm_simulator'):
    """ Runs the given QuantumCircuit object on the given backend.
        Returns the counts.
        Defaults to 'qasm_simulator'.
    """
    backend = Aer.get_backend(pref_backend)
    result = execute(circuit, backend, shots=shots).result()
    return result.get_counts()


def calculate_amplitudes(circuit: QuantumCircuit):
    """ Runs the given QuantumCircuit object on statevector_simulator
        to extrapolate the theoretical probability amplitudes.
    """
    backend = Aer.get_backend('statevector_simulator')
    result = execute(circuit, backend).result()
    return result.get_statevector(circuit, 4).data


def extrapolate(circuit_signature: str, initial_state: str):
    """ Reads a JSON string and builds the corresponding circuit initialized to the specified state.
        Expects a stringified list of lists, representing a list of qubits each
        containing a list of the gates it carries on the UI.
        Expects initial state with tokens in '01+-lr' exclusively.
    """
    circuit = json.loads(circuit_signature)
    if not isinstance(circuit, list) or not all(isinstance(qubit, list) for qubit in circuit):
        raise ValueError('Passed signature is not an array of arrays.')
    
    # '0': |0>, '1': |1>, '+': |+>, '-': |->, 'r': |+i>, 'l': |-i>
    if any(token not in ['0', '1', '+', '-', 'r', 'l'] for token in initial_state):
        raise ValueError('Unrecognized token encountered in initial_state.')

    circuit = np_rectangular(circuit, 'identityGate')
    n_qubits = circuit.shape[0]
    qc = QuantumCircuit(n_qubits, n_qubits)
    qc.initialize(initial_state)

    for col in circuit.T:
        # segregate all indeces into relevant groups
        controls = np.where(col == 'controlGate')[0]
        anticontrols = np.where(col == 'anticontrolGate')[0]
        swaps = np.where(col == 'swapGate')[0]
        measurements = np.where(col == 'measurementGate')[0]
        regulars = (np.where(col == 'xGate')[0].tolist() +  # disgusting solution
                    np.where(col == 'yGate')[0].tolist() +  # but I spent way too
                    np.where(col == 'zGate')[0].tolist() +  # much time searching
                    np.where(col == 'hGate')[0].tolist() +  # for a better
                    np.where(col == 'sGate')[0].tolist() +  # alternative
                    np.where(col == 'tGate')[0].tolist())
        powers = (np.where(np.core.defchararray.startswith(col.astype(str), 'nthXGate'))[0].tolist() +
                  np.where(np.core.defchararray.startswith(col.astype(str), 'nthYGate'))[0].tolist() +
                  np.where(np.core.defchararray.startswith(col.astype(str), 'nthZGate'))[0].tolist())

        # merge all the paulis and swaps into a single gate
        custom_gate = create_gate(swaps, regulars, powers, col)
        # add controls for the entire column
        for _ in controls:
            custom_gate = custom_gate.control()
        for _ in anticontrols:
            custom_gate = custom_gate.control(ctrl_state='0')  # anticontrol

        # add custom_gate to the global circuit
        qc.append(custom_gate, anticontrols.tolist() + controls.tolist() + regulars + powers + swaps.tolist())

        # manually measure the qubits with measurement gates on them
        for pos in measurements:
            qc.measure(pos, pos)

        qc.barrier()

    return qc


def create_gate(i_swap, i_reg, i_pow, _column):
    """ Builds a unitary gate for the entire column that contains
        len(i_rest) pauli or phase shift gates and len(i_swap) swap gates
        (effectively 2 or none) in that order. The gates are added
        sequentially and its up to the user to index each actual gate
        correctly in the super-circuit level.
    """
    # create a sub-circuit that will act as basis for the custom gate
    # This is necessary because the specified controls must affect
    # the entire circuit
    n = len(i_swap) + len(i_reg) + len(i_pow)
    custom_gate = QuantumCircuit(n)
    # HTML DIV id to Gate map
    INCLUDE_GATE = {
        'xGate': custom_gate.x,
        'yGate': custom_gate.y,
        'zGate': custom_gate.z,
        'hGate': custom_gate.h,
        'sGate': custom_gate.s,
        'tGate': custom_gate.t
    }
    # add all the regular gates first manually
    i = 0
    for pos in i_reg:
        gate_id = _column[pos]
        if gate_id not in INCLUDE_GATE.keys():
            continue
        INCLUDE_GATE[gate_id](i)
        i += 1

    # add the power gates
    # fetch the appropriate power from the original string id
    POWERED_GATE = {
        'nthXGate': XGate,
        'nthYGate': YGate,
        'nthZGate': ZGate
    }
    for pos in i_pow:
        gate_id, pwr = _column[pos].split('-') 
        gate_type = POWERED_GATE.get(gate_id)
        if gate_type:
            custom_gate.append(gate_type().power(float(Fraction(pwr))), [i])
            i += 1

    # add the swap gates
    # by definition there will either be exactly 2 indeces here, or none
    if i_swap.shape[0] == 2:
        custom_gate.swap(i, i + 1)
        i += 2

    # merge the above circuit into a gate
    return custom_gate.to_gate()


def np_rectangular(arr: list, dummy_value):
    """ Fills the given list with dummy values until it becomes a perfect
        rectangle, then turns it into a numpy array.
    """
    arr_copy = arr.copy()
    max_length = max(len(row) for row in arr)
    for row in arr_copy:
        while len(row) < max_length:
            row.append(dummy_value)

    return np.array(arr_copy)


if __name__ == '__main__':
    app.run()
    
