from qiskit import QuantumCircuit, transpile
from qiskit_aer import Aer
from qiskit.extensions import Initialize
from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
from sympy import sympify
from numpy.core.defchararray import startswith
from lookup.tables import *
from collections import defaultdict
import numpy as np

app = Flask(__name__)
CORS(app)


@app.route('/parser', methods=['POST'])
@cross_origin()
def run_simulation():
    counts, amplitudes, probabilites, unitary, unitary_squares = None, None, None, None, None    
    template: dict = request.get_json()

    qc, ps = build_circuit(template.get('length'), get_gate_matrix(template))

    if template.get('includeUnitary'):
        # reverse the bits to temporarily combat little-endianness
        unitary, unitary_squares = calculate_unitary(qc.reverse_bits())

    # initialize after potentially computing the unitary
    qc.compose(Initialize(get_initial_state(template)), front = True, inplace = True)

    if template.get('includeAmps'):
        # remove any measurements temporarily to calculate true amplitudes
        # post selection still applies
        amplitudes, probabilites = calculate_amplitudes(qc.remove_final_measurements(inplace = False), ps)
    if template.get('includeCounts'):
        counts = calculate_counts(qc, template.get('backend'), int(template.get('shots')), ps)

    return jsonify({
        'counts': counts,
        'amplitudes': amplitudes,
        'probabilites': probabilites,
        'unitary': unitary,
        'unitary_squares': unitary_squares
    })


def get_initial_state(template: dict) -> str:
    """ Builds the specified initial state in 
        little endian, qiskit lettering format.
    """
    initial_state = ''

    for qubit in template.values():
        if not isinstance(qubit, dict):
            continue
        initial_state += ket2str.get(qubit.get('state'), '0')

    return initial_state[::-1]


def get_gate_matrix(template: dict, dummy: str = 'identityGate', ignore: str = None) -> np.ndarray:
    """ Compiles all gate lists into a single matrix, respecting given indeces.
        Pads lists into a rectangle by filling short rows with dummy values.
        Potentially replaces ignore instances with dummy values.
    """
    matrix = []
    # compile all gate lists into a single matrix
    for qubit in template.values():
        if isinstance(qubit, dict):
            matrix.append(qubit.get('gates', []))
    
    # pad the matrix with dummy values till it becomes a perfect rectangle
    max_length = max(len(row) for row in matrix)
    for row in matrix:
        while len(row) < max_length:
            row.append(dummy)
    
    matrix = np.array(matrix)

    # replace all ignore instances with dummy values, if specified
    return np.where(matrix == ignore, dummy, matrix) if ignore and matrix.shape[1] > 0 else matrix


def segregate(column: list[str]):
    """ Splits the indeces of the column based on gate type.
    """
    powers, rest = [], []

    for gate_type in regular_gates:
        rest += np.where(column == gate_type)[0].tolist()
    for gate_type in powered_gates:
        powers += np.where(startswith(column.astype(str), gate_type))[0].tolist()

    swaps = np.where(column == 'swapGate')[0].tolist()
    controls = np.where(startswith(column.astype(str), 'controlGate'))[0].tolist()
    measurements = np.where(startswith(column.astype(str), 'measurementGate'))[0].tolist()
    
    return controls, swaps, measurements, powers, rest


def create_gate(regulars: list, powers: list, swaps: list, column: list):
    """ Molds the given indeces into a single quantum gate. The subgates
        are added serially, first the regulars, then the powers (with their
        appropriate exponent), and then the swaps iff there are exactly 2.
    """
    custom_gate = QuantumCircuit(len(regulars) + len(powers) + len(swaps))

    i = 0
    for pos in regulars:
        custom_gate.append(regular_gates.get(column[pos])(), [i])
        i += 1
    for pos in powers:
        _id, _pwr = column[pos].split('<!@DELIMITER>')
        custom_gate.append(powered_gates.get(_id)().power(float(sympify(_pwr).evalf())), [i])
        i += 1
    if len(swaps) == 2:
        custom_gate.swap(i, i + 1)
    
    return custom_gate.to_gate()


def build_circuit(n_qubits: int, gate_matrix: np.ndarray, initial_state: str = None):
    """ Translates the gate matrix into a Quantum Circuit by turning
        each column into a gate and appending it to the circuit.
    """
    qc = QuantumCircuit(n_qubits, n_qubits)
    if initial_state is not None:
        qc.initialize(initial_state)

    post_selections = {}

    for col in gate_matrix.T:
        # merge the entire column into a single gate
        controls, swaps, measurements, powers, rest = segregate(col)
        custom_gate = create_gate(rest, powers, swaps, col)

        # add controls for the entire column
        for pos in controls:
            _, mode = col[pos].split('<!@DELIMITER>')
            custom_gate = custom_gate.control(ctrl_state = control_states[int(mode)])

        # add controlled gate to circuit at correct indeces
        qc.append(custom_gate, controls + rest + powers + swaps)

        # add measurements
        for pos in measurements:
            # save post-selections for later
            _, mode = col[pos].split('<!@DELIMITER>')  
            mode = int(mode)
            if mode > 0:             
                # mode 1 --> ps 0 --> keep |0>
                # mode 2 --> ps 1 --> keep |1>
                post_selections[pos] = '0' if mode == 1 else '1'
            # measure normally
            qc.measure(pos, pos)

        # column done, move to the next
        qc.barrier()

    return qc, post_selections


def execute(circuit: QuantumCircuit, backend, shots: int = None):
    """ Transpiles the given circuit with the given backend
        and then runs the experiment.
    """
    tqc = transpile(circuit, backend)
    return backend.run(tqc, shots = shots)


def post_select_counts(complete_counts: dict[str, int], i_qubit: int, postselect_state: str) -> dict[str, int]:
    """ Enforces the specified postselection on the given counts.
        Discards all states in the counts dictionary that dont have
        the given postselect_state on qubit i_qubit.
    """
    ps_counts = {}
    for state, counts in complete_counts.items():
        # if the given postselection matches the current state-count pair,
        # include it into the new dictionary as is. Otherwise, include 0.
        ps_counts[state] = counts * int(state[::-1][i_qubit] == postselect_state)
    return ps_counts


def post_select_statevector(statevector: np.ndarray, i_qubit: int, postselect_state: str) -> np.ndarray:
    """ Enforces the specified postselection on the given statevector.
        Sends all amplitudes in the sv whose state doesnt have the given
        postselect_state on qubit i_qubit to 0, then normalizes the new sv.
    """
    sv_shape = statevector.shape[0]
    new_sv = np.zeros(sv_shape, dtype = complex)
    for state, amplitude in enumerate(statevector):
        # turn to binary string, remove the '0b' prefix, fill with 
        # leading 0 to bring to size 'n_qubits' and then reverse it
        # to little endian
        state2bin = bin(state)[2:].zfill(int(np.sqrt(sv_shape)))[::-1]
        # if the given postselection matches the current state-amp pair,
        # include it into the new list as is. Otherwise, include 0.
        new_sv[state] = amplitude if state2bin[i_qubit] == postselect_state else 0.+0.j
    # re-normalize the statevector to obey sum == 1
    return np.round(new_sv / np.linalg.norm(new_sv), 4)


def calculate_counts(circuit: QuantumCircuit, backend: str, shots: int, post_selections: dict[int, str]) -> dict:
    """ Runs the given circuit on the specified backend, 'shots' times.
        Returns the dictionary of resulting counts.
    """
    try:
        job = execute(
            circuit,
            Aer.get_backend(backend),
            shots
        )
        counts = job.result().get_counts()        

        # apply post-selection
        for q_index, q_ps in post_selections.items():
            counts = post_select_counts(counts, q_index, q_ps)

        return counts
    except Exception as e:
        print(f'Exception raised at calculate_counts:\n {e}')
        return None


def calculate_amplitudes(circuit: QuantumCircuit, post_selections: dict[int, str]):
    """ Runs the given circuit on Statevector sim to extrapolate
        theoretical amplitudes and probabilites.
    """
    try:
        job = execute(
            circuit,
            Aer.get_backend('statevector_simulator'),
        )
        amplitudes = job.result().get_statevector(circuit, 4).data

        # apply post-selection
        for q_index, q_ps in post_selections.items():
            amplitudes = post_select_statevector(amplitudes, q_index, q_ps)

        probabilities = np.round(np.abs(amplitudes) ** 2, 4).tolist()

        # remove unnecessary parentheses
        amplitudes = [el.replace('(', '').replace(')', '') for el in amplitudes.astype(str).tolist()]

        return amplitudes, probabilities    
    except Exception as e:
        print(f'Exception raised at calculate_amplitudes:\n {e}')
        return None, None


def calculate_unitary(circuit: QuantumCircuit):
    """ Runs the given circuit on Unitary sim without initializing
        to extrapolate its entire unitary matrix.
    """
    try:
        job = execute(
            circuit, 
            Aer.get_backend('unitary_simulator')
        )
        unitary = job.result().get_unitary(circuit, 4).data

        squares = np.round(np.abs(unitary) ** 2, 4).tolist()

        # remove unnecessary parentheses
        unitary = unitary.astype(str).tolist()
        for row in unitary:
            for i, el in enumerate(row):
                row[i] = el.replace('(', '').replace(')', '')
        
        return unitary, squares
    except Exception as e:
        print(f'Exception raised at calculate_unitary:\n {e}')
        return None, None
    

if __name__ == '__main__':
    app.run()