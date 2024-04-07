from qiskit import QuantumCircuit, transpile
from qiskit_aer import Aer
from qiskit.circuit.library import XGate, YGate, ZGate, HGate, SGate, TGate
from qiskit.extensions import Initialize
from sympy import sympify
from numpy.core.defchararray import startswith
import numpy as np
import json
from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin

ket2str: dict = {
    '|0〉': '0', '|1〉': '1',
    '|+〉': '+', '|-〉': '-',
    '|+j〉': 'r', '|-j〉': 'l'
}

regular_gates: dict = {
    'xGate': XGate,
    'yGate': YGate,
    'zGate': ZGate,
    'hGate': HGate,
    'sGate': SGate,
    'tGate': TGate,
}

powered_gates: dict = {
    'nthXGate': XGate,
    'nthYGate': YGate,
    'nthZGate': ZGate
}

custom_gates: dict = {}

app = Flask(__name__)
CORS(app)

@app.route('/parser', methods = ['POST'])
@cross_origin()
def parse():
    """ 
    Reads the input data line by line, constructs any custom gates
    and runs the described circuit.

    Returns:
    The stringified dictionary containing the outputs.
    """
    data: list[str] = request.get_json().split('\r\n')
    length: int = len(data)

    for i, line in enumerate(data):
        template: dict = json.loads(line)
        qc, ps = build_circuit(template, i == length - 1)
        if i == length - 1:
            return jsonify(execute(qc, template, ps))            
        custom_gates[template.get('id')] = (qc.to_gate, template.get('length'))


def initial_state(template: dict) -> str:
    """
    Reads the states of each qubit inside the `template` and constructs the
    total initial state.

    Parameters:
    `template`: The JSON object describing the concerned circuit.

    Returns:
    The initial state in Qiskit format, reversed if `big_endian` is False.
    """
    init: list = []

    for qubit in template.values():
        if isinstance(qubit, dict):
            init.append(ket2str.get(qubit.get('state'), '0'))
    
    return ''.join(init) if template.get('bigEndian') else ''.join(init[::-1])


def gate_matrix(template: dict, dummy: str = 'identityGate') -> np.ndarray:
    """
    Compiles all gate lists from each qubit and constructs the total gate matrix.
    Each row represents a qubit, each column a step.

    Parameters:
    `template`: The JSON object describing the concerned circuit.
    `dummy` (Optional): The default element to place when an empty position is found.

    Returns:
    The gate matrix as a numpy array.
    """
    gates_list: list = [qubit.get('gates', []) for qubit in template.values() if isinstance(qubit, dict)]
    
    matrix: np.ndarray = np.full(
        (len(gates_list), max(len(row) for row in gates_list)),
        dummy, dtype=object
    )

    for i, row in enumerate(gates_list):
        matrix[i, :len(row)] = row

    return matrix


def segregate(step: np.ndarray):
    """
    Splits the `step` into multiple lists containing indeces to related gates.

    Parameters:
    `step`: A gate matrix column. Must contain strings.

    Returns:
    A 6-way split, containing the indeces of swaps, measurements, powers, controls, customs
    and rest inside the `step`.
    """
    rest: np.ndarray = np.array([], dtype=int)
    powers: np.ndarray = np.array([], dtype=int)

    for gate_type in regular_gates:
        rest = np.concatenate((rest, np.where(step == gate_type)[0]))
    for gate_type in powered_gates:
        powers = np.concatenate((powers, np.where(startswith(step.astype(str), gate_type))[0]))

    return (
        np.where(startswith(step.astype(str), 'controlGate'))[0],
        np.where(step == 'swapGate')[0],
        np.where(startswith(step.astype(str), 'measurementGate'))[0],
        np.where(startswith(step.astype(str), 'customGate'))[0],
        powers, rest
    )


def create_gate(rest: np.ndarray, powers: np.ndarray, customs: np.ndarray, swaps: np.ndarray, step: np.ndarray):
    """
    Constructs a new gate from the given arrays, that contains all described gates.
    The gates are added in order of appearance, meaning `rest` gates are first, then `powers`,
    then custom gates and then `swaps`.

    Parameters:
    `rest`:    The array containing indeces to all normal and user-made gates found in the `step`.
    `powers`:  The array containing indeces to all powered gates found inside the `step`.
    `customs`: The array containing indeces to all custom gates found inside the `step`.
    `swaps`:   The array containing indeces to all swap gates found inside the `step`.
    `step`:    The step to turn into a unified gate.

    Returns:
    The new gate object representing the entire `step`.
    """
    # include support indeces in the initialization so the correct amount of qubits is loaded
    supports: np.ndarray = np.where(startswith(step.astype(str), '^'))[0]
    unified: QuantumCircuit = QuantumCircuit(rest.shape[0] + powers.shape[0] + customs.shape[0] + supports.shape[0] + swaps.shape[0])

    pos: int = 0
    for i in rest:
        unified.append(regular_gates.get(step[i])(), [pos])
        pos += 1
    for i in powers:
        _id, _power = step[i].split('<!@DELIMITER>')
        # add the gate after applying the power to it
        unified.append(powered_gates.get(_id)().power(float(sympify(_power).evalf())), [pos])
        pos += 1
    for i in customs:
        gate, span = custom_gates.get(step[i])
        unified.append(gate(), [pos + j for j in range(span)])
        pos += span
    if swaps.shape[0] == 2:
        unified.swap(pos, pos + 1)

    return unified.to_gate()


def build_circuit(template: dict, include_bits: bool = False) -> tuple[QuantumCircuit, dict]:
    """
    Constructs the circuit described by `template` as a `QuantumCircuit`.

    Parameters:
    `template`: The JSON object describing the circuit to construct.
    `include_bits`: Whether to add a classical register to the new circuit.

    Returns:
    `qc`: The constructed `QuantumCircuit`
    `postselections`: The dictionary containing the indeces and states of any postselections
    present in the circuit.
    """
    n_qubits: int = template.get('length')
    
    qc: QuantumCircuit = QuantumCircuit(n_qubits, n_qubits) if include_bits else QuantumCircuit(n_qubits)
    postselections: dict[int, str] = {}

    for step in gate_matrix(template).T:
        controls, swaps, measurements, customs, powers, rest = segregate(step)
        step_gate = create_gate(rest, powers, customs, swaps, step)

        for i in controls:
            # add any controls to the entire unified gate
            _, mode = step[i].split('<!@DELIMITER>')
            step_gate = step_gate.control(ctrl_state = '1' if mode == '0' else '0')
        
        full_customs = []
        for i in customs:
            # compile custom gate indeces along with that of their supports
            _, span = custom_gates.get(step[i])
            for j in range(span):
                full_customs.append(i + j)

        positions: tuple = (controls, rest, powers, full_customs, swaps) if full_customs else (controls, rest, powers, swaps)
        qc.append(step_gate, np.concatenate(positions).tolist())

        for i in measurements:            
            # record postselection positions for later
            _, mode = step[i].split('<!@DELIMITER>')
            if mode != '0':
                postselections[i] = '0' if mode == '1' else '1'
            # add measurements independently
            qc.measure(i, i)
    
    return qc, postselections    


def post_select_counts(complete_counts: dict[str, int], i_qubit: int, postselect_state: str) -> dict[str, int]:
    """ 
    Enforces the specified postselection on the given counts.
    Discards all states in the counts dictionary that dont have
    the given postselect_state on qubit i_qubit.

    Parameters:
    `complete_counts`: The counts dictionary received by `get_counts()`
    `i_qubit`: The index of the postselected qubit.
    `postselect_state`: The state to postselect the qubit on (0/1).

    Returns:
    The filtered `counts` dictionary.
    """
    ps_counts: dict[str, int] = {}
    for state, counts in complete_counts.items():
        # if the given postselection matches the current state-count pair,
        # include it into the new dictionary as is. Otherwise, include 0.
        ps_counts[state] = counts * int(state[::-1][i_qubit] == postselect_state)
    return ps_counts


def post_select_statevector(statevector: np.ndarray, i_qubit: int, postselect_state: str) -> np.ndarray:
    """ 
    Enforces the specified postselection on the given statevector.
    Sends all amplitudes in the sv whose state doesnt have the given
    postselect_state on qubit i_qubit to 0, then normalizes the new sv.

    Parameters:
    `statevector`: The statevector array received by `StatevectorSimulator`
    `i_qubit`: The index of the postselected qubit.
    `postselect_state`: The state to postselect the qubit on (0/1).

    Returns:
    The filtered `statevector` array.
    """
    sv_shape: int = statevector.shape[0]
    new_sv: np.ndarray = np.zeros(sv_shape, dtype = complex)
    for state, amplitude in enumerate(statevector):
        # turn to binary string, remove the '0b' prefix, fill with 
        # leading 0 to bring to size 'n_qubits' and then reverse it
        # to little endian
        state2bin: str = bin(state)[2:].zfill(int(np.sqrt(sv_shape)))[::-1]
        # if the given postselection matches the current state-amp pair,
        # include it into the new list as is. Otherwise, include 0.
        new_sv[state] = amplitude if state2bin[i_qubit] == postselect_state else 0.+0.j
    # re-normalize the statevector to obey sum == 1
    return np.round(new_sv / np.linalg.norm(new_sv), 4)  


def execute(circuit: QuantumCircuit, template: dict, postselections: dict[int, str]):
    """
    Runs the `circuit` according to specifications found inside `template`, then applies
    the filtering described by `postselections` to the results.

    Parameters:
    `circuit`: The `QuantumCircuit` object to execute experiments on.
    `template`: The JSON object describing the passed `circuit`.
    `postselections`: The dictionary of postselection indeces and states to apply to the results.

    Returns:
    The dictionary containing all the calculated results.
    """
    counts, amps, probs, unitary, squares = None, None, None, None, None

    if template.get('bigEndian'):
        circuit = circuit.reverse_bits()

    if template.get('includeUnitary'):
        # calculate the total unitary matrix of the circuit if specified
        try:
            backend = Aer.get_backend('unitary_simulator')
            unitary = backend.run(transpile(circuit, backend)).result().get_unitary(circuit, 4).data
            # calculate the squares of the elements as well to use for the heatmap
            squares: list = np.round(np.abs(unitary) ** 2, 4).tolist()
            # turn the unitary into a matrix of strs because JS doesn't recognize complex numbers
            unitary = unitary.astype(str).tolist()
            for row in unitary:
                for i, element in enumerate(row):
                    # remove redundant parentheses
                    row[i] = element.replace('(', '').replace(')', '')
        except Exception as e:
            print(f'Unitary calculation failed:\n {e}')

    if template.get('includeAmps') or template.get('includeCounts'):
        # initialize after calculating the unitary to not mess with the result
        circuit.compose(Initialize(initial_state(template)), front = True, inplace = True)

    if template.get('includeAmps'):
        # calculate the final statevector and corresponding probabilites if specified
        try:
            backend = Aer.get_backend('statevector_simulator')
            circ: QuantumCircuit = circuit.remove_final_measurements(inplace = False)
            amps = backend.run(transpile(circ, backend)).result().get_statevector(circ, 4).data
            for i, state in postselections.items():
                amps = post_select_statevector(amps, i, state)
            probs: list = np.round(np.abs(amps) ** 2, 4).tolist()
            amps = [element.replace('(', '').replace(')', '') for element in amps.astype(str).tolist()]
        except Exception as e:
            print(f'Amplitudes calculation failed:\n {e}')
    
    if template.get('includeCounts'):
        # calculate counts if specified
        try:
            backend = Aer.get_backend(template.get('backend'))
            counts: dict[str, int] = backend.run(transpile(circuit, backend), shots = int(template.get('shots'))).result().get_counts()
            for i, state in postselections.items():
                counts = post_select_counts(counts, i, state)
        except Exception as e:
            print(f'Counts calculation failed:\n {e}')
        
    return {
        'counts': counts,
        'amplitudes': amps,
        'probabilites': probs,
        'unitary': unitary,
        'unitary_squares': squares
    }


if __name__ == '__main__':
    app.run()
