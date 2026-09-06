// Getter signatures from leverage/src/lending/lendingpool/LendingPool.sol and DataTypes.sol.
export const farmReserveAbi = [
  {
    type: "function",
    name: "reserves",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "borrowingIndex",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "currentBorrowingRate",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "totalBorrows",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "underlyingTokenAddress",
        type: "address",
        internalType: "address",
      },
      {
        name: "eTokenAddress",
        type: "address",
        internalType: "address",
      },
      {
        name: "stakingAddress",
        type: "address",
        internalType: "address",
      },
      {
        name: "reserveCapacity",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "borrowingRateConfig",
        type: "tuple",
        internalType: "struct DataTypes.InterestRateConfig",
        components: [
          {
            name: "utilizationA",
            type: "uint128",
            internalType: "uint128",
          },
          {
            name: "borrowingRateA",
            type: "uint128",
            internalType: "uint128",
          },
          {
            name: "utilizationB",
            type: "uint128",
            internalType: "uint128",
          },
          {
            name: "borrowingRateB",
            type: "uint128",
            internalType: "uint128",
          },
          {
            name: "maxBorrowingRate",
            type: "uint128",
            internalType: "uint128",
          },
        ],
      },
      {
        name: "id",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "lastUpdateTimestamp",
        type: "uint128",
        internalType: "uint128",
      },
      {
        name: "reserveFeeRate",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "flags",
        type: "tuple",
        internalType: "struct DataTypes.Flags",
        components: [
          {
            name: "isActive",
            type: "bool",
            internalType: "bool",
          },
          {
            name: "frozen",
            type: "bool",
            internalType: "bool",
          },
          {
            name: "borrowingEnabled",
            type: "bool",
            internalType: "bool",
          },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalLiquidityOfReserve",
    inputs: [
      {
        name: "reserveId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "totalLiquidity",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "utilizationRateOfReserve",
    inputs: [
      {
        name: "reserveId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
] as const;
