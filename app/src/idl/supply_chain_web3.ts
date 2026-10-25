/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/supply_chain_web3.json`.
 */
export type SupplyChainWeb3 = {
  "address": "5k3AeBoUR2LsjXT8XtddP9VfcnztLQyiK5YgYscPtReX",
  "metadata": {
    "name": "supplyChainWeb3",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "addLineItem",
      "discriminator": [
        133,
        114,
        152,
        31,
        119,
        9,
        92,
        165
      ],
      "accounts": [
        {
          "name": "source",
          "writable": true,
          "signer": true,
          "relations": [
            "batch"
          ]
        },
        {
          "name": "roleAssignment",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "source"
              }
            ]
          }
        },
        {
          "name": "batch",
          "writable": true
        },
        {
          "name": "product",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  100,
                  117,
                  99,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "skuCode"
              }
            ]
          }
        },
        {
          "name": "lineItem",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  110,
                  101,
                  95,
                  105,
                  116,
                  101,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "batch"
              },
              {
                "kind": "arg",
                "path": "index"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "index",
          "type": "u16"
        },
        {
          "name": "skuCode",
          "type": "string"
        },
        {
          "name": "quantity",
          "type": "u64"
        }
      ]
    },
    {
      "name": "grantRole",
      "discriminator": [
        218,
        234,
        128,
        15,
        82,
        33,
        236,
        253
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "adminRoleAssignment",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "admin"
              }
            ]
          }
        },
        {
          "name": "targetRoleAssignment",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  108,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "wallet",
          "type": "pubkey"
        },
        {
          "name": "role",
          "type": {
            "defined": {
              "name": "role"
            }
          }
        }
      ]
    },
    {
      "name": "initializeConfig",
      "discriminator": [
        208,
        127,
        21,
        1,
        194,
        190,
        196,
        70
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "roleAssignment",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "admin"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "logMovement",
      "discriminator": [
        42,
        170,
        70,
        250,
        120,
        2,
        199,
        241
      ],
      "accounts": [
        {
          "name": "carrier",
          "writable": true,
          "signer": true
        },
        {
          "name": "roleAssignment",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "carrier"
              }
            ]
          }
        },
        {
          "name": "batch",
          "writable": true
        },
        {
          "name": "movement",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  118,
                  101,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "batch"
              },
              {
                "kind": "account",
                "path": "batch.movementCount",
                "account": "batch"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "vehicleId",
          "type": {
            "option": "string"
          }
        },
        {
          "name": "fromLocation",
          "type": "string"
        },
        {
          "name": "toLocation",
          "type": "string"
        }
      ]
    },
    {
      "name": "receiveAtRestaurant",
      "discriminator": [
        131,
        136,
        89,
        228,
        205,
        51,
        90,
        103
      ],
      "accounts": [
        {
          "name": "restaurant",
          "signer": true
        },
        {
          "name": "roleAssignment",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "restaurant"
              }
            ]
          }
        },
        {
          "name": "batch",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "registerBatch",
      "discriminator": [
        255,
        186,
        59,
        153,
        95,
        233,
        143,
        171
      ],
      "accounts": [
        {
          "name": "source",
          "writable": true,
          "signer": true
        },
        {
          "name": "roleAssignment",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "source"
              }
            ]
          }
        },
        {
          "name": "batch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "arg",
                "path": "batchId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "batchId",
          "type": {
            "array": [
              "u8",
              16
            ]
          }
        },
        {
          "name": "sourceType",
          "type": {
            "defined": {
              "name": "sourceType"
            }
          }
        },
        {
          "name": "lineItemCount",
          "type": "u16"
        }
      ]
    },
    {
      "name": "registerProduct",
      "discriminator": [
        224,
        97,
        195,
        220,
        124,
        218,
        78,
        43
      ],
      "accounts": [
        {
          "name": "registrant",
          "writable": true,
          "signer": true
        },
        {
          "name": "roleAssignment",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "registrant"
              }
            ]
          }
        },
        {
          "name": "product",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  100,
                  117,
                  99,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "skuCode"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "skuCode",
          "type": "string"
        },
        {
          "name": "name",
          "type": "string"
        }
      ]
    },
    {
      "name": "revokeRole",
      "discriminator": [
        179,
        232,
        2,
        180,
        48,
        227,
        82,
        7
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true
        },
        {
          "name": "adminRoleAssignment",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "admin"
              }
            ]
          }
        },
        {
          "name": "targetRoleAssignment",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  108,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "wallet"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "wallet",
          "type": "pubkey"
        },
        {
          "name": "role",
          "type": {
            "defined": {
              "name": "role"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "batch",
      "discriminator": [
        156,
        194,
        70,
        44,
        22,
        88,
        137,
        44
      ]
    },
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "lineItem",
      "discriminator": [
        188,
        57,
        119,
        204,
        240,
        30,
        22,
        191
      ]
    },
    {
      "name": "movement",
      "discriminator": [
        137,
        179,
        90,
        160,
        172,
        21,
        188,
        45
      ]
    },
    {
      "name": "product",
      "discriminator": [
        102,
        76,
        55,
        251,
        38,
        73,
        224,
        229
      ]
    },
    {
      "name": "roleAssignment",
      "discriminator": [
        205,
        130,
        191,
        231,
        211,
        225,
        155,
        246
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Signer is not authorized to perform this action"
    },
    {
      "code": 6001,
      "name": "stringTooLong",
      "msg": "Provided string exceeds maximum allowed length"
    },
    {
      "code": 6002,
      "name": "invalidStatusTransition",
      "msg": "Batch has already been delivered"
    },
    {
      "code": 6003,
      "name": "roleNotHeld",
      "msg": "Wallet does not hold the role being revoked"
    },
    {
      "code": 6004,
      "name": "lineItemIndexOutOfRange",
      "msg": "Line item index is not less than the batch's declared line_item_count"
    }
  ],
  "types": [
    {
      "name": "batch",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "batchId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "sourceType",
            "type": {
              "defined": {
                "name": "sourceType"
              }
            }
          },
          {
            "name": "source",
            "type": "pubkey"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "batchStatus"
              }
            }
          },
          {
            "name": "movementCount",
            "type": "u32"
          },
          {
            "name": "receivedBy",
            "type": "pubkey"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "deliveredAt",
            "type": "i64"
          },
          {
            "name": "lineItemCount",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "batchStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "registered"
          },
          {
            "name": "inTransit"
          },
          {
            "name": "delivered"
          }
        ]
      }
    },
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bootstrapAuthority",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "lineItem",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "batch",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u16"
          },
          {
            "name": "product",
            "type": "pubkey"
          },
          {
            "name": "quantity",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "movement",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "batch",
            "type": "pubkey"
          },
          {
            "name": "carrier",
            "type": "pubkey"
          },
          {
            "name": "vehicleId",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "fromLocation",
            "type": "string"
          },
          {
            "name": "toLocation",
            "type": "string"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "product",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "skuCode",
            "type": "string"
          },
          {
            "name": "name",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "role",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "admin"
          },
          {
            "name": "source"
          },
          {
            "name": "carrier"
          },
          {
            "name": "restaurant"
          }
        ]
      }
    },
    {
      "name": "roleAssignment",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "isAdmin",
            "type": "bool"
          },
          {
            "name": "isSource",
            "type": "bool"
          },
          {
            "name": "isCarrier",
            "type": "bool"
          },
          {
            "name": "isRestaurant",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "sourceType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "farmer"
          },
          {
            "name": "factory"
          },
          {
            "name": "traditionalMarket"
          },
          {
            "name": "supermarket"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "batchSeed",
      "type": "bytes",
      "value": "[98, 97, 116, 99, 104]"
    },
    {
      "name": "configSeed",
      "type": "bytes",
      "value": "[99, 111, 110, 102, 105, 103]"
    },
    {
      "name": "lineItemSeed",
      "type": "bytes",
      "value": "[108, 105, 110, 101, 95, 105, 116, 101, 109]"
    },
    {
      "name": "movementSeed",
      "type": "bytes",
      "value": "[109, 111, 118, 101, 109, 101, 110, 116]"
    },
    {
      "name": "productSeed",
      "type": "bytes",
      "value": "[112, 114, 111, 100, 117, 99, 116]"
    },
    {
      "name": "roleSeed",
      "type": "bytes",
      "value": "[114, 111, 108, 101]"
    }
  ]
};
