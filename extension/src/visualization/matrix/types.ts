export type MatrixCellState="neutral"|"active"|"read"|"write"|"compare";
export interface MatrixCell{row:number;column:number;value:unknown;state:MatrixCellState}
export interface MatrixScene{id:string;name:string;rows:number;columns:number;cells:MatrixCell[]}
export type MatrixSemanticEvent=
 | {type:"MATRIX_CREATE";matrixId:string;name:string;values:unknown[][];sourceLine?:number}
 | {type:"MATRIX_READ";matrixId:string;row:number;column:number;value:unknown;sourceLine?:number}
 | {type:"MATRIX_WRITE";matrixId:string;row:number;column:number;before:unknown;after:unknown;sourceLine?:number}
 | {type:"MATRIX_COMPARE";matrixId:string;row:number;column:number;value:unknown;sourceLine?:number};
