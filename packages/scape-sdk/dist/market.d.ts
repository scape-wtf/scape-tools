export interface GizmoMarketToken {
    address: string;
    symbol: string;
    name: string;
}
export interface GizmoMarket {
    kind: 'solana-token';
    field: string;
    action: string;
    /** Optional shared field: 'label' (default) or 'card'. */
    displayField?: string;
}
export declare function validSolanaMint(value: unknown): value is string;
export declare function validGizmoMarketToken(value: unknown): value is GizmoMarketToken | null;
export declare function validGizmoMarket(value: unknown): value is GizmoMarket;
