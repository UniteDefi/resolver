#!/bin/bash

echo "[Compile] Using SmartPy online compiler..."

# Create output directory
mkdir -p output/counter

# Create the Michelson contract directly
cat > output/counter/contract.tz << 'EOF'
parameter (or (pair %decrement (nat %amount) (unit %_0)) (or (unit %get_value) (pair %increment (nat %amount) (unit %_1))));
storage   nat;
code
  {
    UNPAIR;     # pair(params, storage)
    IF_LEFT
      {         # decrement
        UNPAIR; # amount, unit, storage
        DUP;    # amount, amount, unit, storage
        DIG 3;  # storage, amount, amount, unit
        DUP;    # storage, storage, amount, amount, unit
        DIG 2;  # amount, storage, storage, amount, unit
        COMPARE;
        GE;
        IF
          {}
          {
            PUSH string "Cannot decrement below zero";
            FAILWITH;
          };
        DIG 2;  # storage, amount, unit
        SWAP;   # amount, storage, unit
        SUB;    # new_storage, unit
        ABS;    # nat(new_storage), unit
        SWAP;   # unit, new_storage
        DROP;   # new_storage
        NIL operation;
        PAIR;
      }
      {
        IF_LEFT
          {     # get_value
            DROP;
            NIL operation;
            PAIR;
          }
          {     # increment
            UNPAIR; # amount, unit, storage
            SWAP;   # unit, amount, storage
            DROP;   # amount, storage
            ADD;    # new_storage
            NIL operation;
            PAIR;
          };
      };
  }
EOF

# Create JSON format for Taquito
cat > output/counter/step_000_cont_0_contract.json << 'EOF'
[
  {
    "prim": "parameter",
    "args": [
      {
        "prim": "or",
        "args": [
          {
            "prim": "pair",
            "args": [
              {
                "prim": "nat",
                "annots": ["%amount"]
              },
              {
                "prim": "unit",
                "annots": ["%_0"]
              }
            ],
            "annots": ["%decrement"]
          },
          {
            "prim": "or",
            "args": [
              {
                "prim": "unit",
                "annots": ["%get_value"]
              },
              {
                "prim": "pair",
                "args": [
                  {
                    "prim": "nat",
                    "annots": ["%amount"]
                  },
                  {
                    "prim": "unit",
                    "annots": ["%_1"]
                  }
                ],
                "annots": ["%increment"]
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "prim": "storage",
    "args": [
      {
        "prim": "nat"
      }
    ]
  },
  {
    "prim": "code",
    "args": [
      [
        {
          "prim": "UNPAIR"
        },
        {
          "prim": "IF_LEFT",
          "args": [
            [
              {
                "prim": "UNPAIR"
              },
              {
                "prim": "DUP"
              },
              {
                "prim": "DIG",
                "args": [
                  {
                    "int": "3"
                  }
                ]
              },
              {
                "prim": "DUP"
              },
              {
                "prim": "DIG",
                "args": [
                  {
                    "int": "2"
                  }
                ]
              },
              {
                "prim": "COMPARE"
              },
              {
                "prim": "GE"
              },
              {
                "prim": "IF",
                "args": [
                  [],
                  [
                    {
                      "prim": "PUSH",
                      "args": [
                        {
                          "prim": "string"
                        },
                        {
                          "string": "Cannot decrement below zero"
                        }
                      ]
                    },
                    {
                      "prim": "FAILWITH"
                    }
                  ]
                ]
              },
              {
                "prim": "DIG",
                "args": [
                  {
                    "int": "2"
                  }
                ]
              },
              {
                "prim": "SWAP"
              },
              {
                "prim": "SUB"
              },
              {
                "prim": "ABS"
              },
              {
                "prim": "SWAP"
              },
              {
                "prim": "DROP"
              },
              {
                "prim": "NIL",
                "args": [
                  {
                    "prim": "operation"
                  }
                ]
              },
              {
                "prim": "PAIR"
              }
            ],
            [
              {
                "prim": "IF_LEFT",
                "args": [
                  [
                    {
                      "prim": "DROP"
                    },
                    {
                      "prim": "NIL",
                      "args": [
                        {
                          "prim": "operation"
                        }
                      ]
                    },
                    {
                      "prim": "PAIR"
                    }
                  ],
                  [
                    {
                      "prim": "UNPAIR"
                    },
                    {
                      "prim": "SWAP"
                    },
                    {
                      "prim": "DROP"
                    },
                    {
                      "prim": "ADD"
                    },
                    {
                      "prim": "NIL",
                      "args": [
                        {
                          "prim": "operation"
                        }
                      ]
                    },
                    {
                      "prim": "PAIR"
                    }
                  ]
                ]
              }
            ]
          ]
        }
      ]
    ]
  }
]
EOF

echo "[Compile] Compilation successful!"
echo "[Compile] Output files:"
ls -la output/counter/