
export const SupplyChainWeb3ErrorCode = {
  Unauthorized: 6000,
  StringTooLong: 6001,
  InvalidStatusTransition: 6002,
  InvalidMovementInput: 6003
};

export type SupplyChainWeb3ErrorName = keyof typeof SupplyChainWeb3ErrorCode;
