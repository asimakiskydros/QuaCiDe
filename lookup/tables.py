from qiskit.circuit.library import XGate, YGate, ZGate, HGate, SGate, TGate

ket2str = {
    '|0〉': '0', '|1〉': '1',
    '|+〉': '+', '|-〉': '-',
    '|+i〉': 'r', '|-i〉': 'l'
}

control_states = {
    'controlGate': '1',
    'anticontrolGate': '0'
}

regular_gates = {
    'xGate': XGate,
    'yGate': YGate,
    'zGate': ZGate,
    'hGate': HGate,
    'sGate': SGate,
    'tGate': TGate
}

powered_gates = {
    'nthXGate': XGate,
    'nthYGate': YGate,
    'nthZGate': ZGate
}