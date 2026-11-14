# ShopApi

What `Imported.describe` says of the Domain Api bound into Remote: its commands as
mutations, and its Views as the Entities they serve.

## Commands

### ShopApi/ListProduct

Command, sent as the mutation `ListProduct`.

Footprint: unknown. It may write any member of its Entity, so no list is judged unaffected by it.

Input:

```json
{
  "type": "object",
  "properties": {
    "target": {
      "type": "string"
    },
    "input": {
      "type": "object",
      "properties": {
        "row": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string"
            },
            "ownerId": {
              "type": "string"
            },
            "name": {
              "type": "string"
            },
            "status": {
              "type": "string",
              "enum": [
                "draft",
                "published",
                "archived"
              ]
            },
            "stock": {
              "anyOf": [
                {
                  "type": "number"
                },
                {
                  "type": "string",
                  "enum": [
                    "Infinity",
                    "-Infinity",
                    "NaN"
                  ]
                }
              ]
            },
            "reserved": {
              "anyOf": [
                {
                  "type": "number"
                },
                {
                  "type": "string",
                  "enum": [
                    "Infinity",
                    "-Infinity",
                    "NaN"
                  ]
                }
              ]
            },
            "revision": {
              "anyOf": [
                {
                  "type": "number"
                },
                {
                  "type": "string",
                  "enum": [
                    "Infinity",
                    "-Infinity",
                    "NaN"
                  ]
                }
              ]
            }
          },
          "required": [
            "id",
            "ownerId",
            "name",
            "status",
            "stock",
            "reserved",
            "revision"
          ],
          "additionalProperties": true
        }
      },
      "required": [
        "row"
      ],
      "additionalProperties": true
    }
  },
  "required": [
    "target",
    "input"
  ],
  "additionalProperties": true
}
```

Reply: none, only the receipt.

### ShopApi/ReserveStock

Command, sent as the mutation `ReserveStock`.

Footprint: derived from its declared write. Reads `status`, `reserved`, `revision`; writes `reserved`, `revision`.

Input:

```json
{
  "type": "object",
  "properties": {
    "target": {
      "type": "string"
    },
    "input": {
      "type": "object",
      "properties": {
        "revision": {
          "anyOf": [
            {
              "type": "number"
            },
            {
              "type": "string",
              "enum": [
                "Infinity",
                "-Infinity",
                "NaN"
              ]
            }
          ]
        },
        "quantity": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "revision",
        "quantity"
      ],
      "additionalProperties": true
    }
  },
  "required": [
    "target",
    "input"
  ],
  "additionalProperties": true
}
```

Reply:

```json
{
  "type": "object",
  "properties": {
    "reserved": {
      "anyOf": [
        {
          "type": "number"
        },
        {
          "type": "string",
          "enum": [
            "Infinity",
            "-Infinity",
            "NaN"
          ]
        }
      ]
    },
    "revision": {
      "anyOf": [
        {
          "type": "number"
        },
        {
          "type": "string",
          "enum": [
            "Infinity",
            "-Infinity",
            "NaN"
          ]
        }
      ]
    }
  },
  "required": [
    "reserved",
    "revision"
  ],
  "additionalProperties": true
}
```

Rejections:

- `Conflict`

  ```json
  {
    "$ref": "#/$defs/ConflictEncoded",
    "$defs": {
      "ConflictEncoded": {
        "type": "object",
        "properties": {
          "_tag": {
            "type": "string",
            "enum": [
              "Conflict"
            ]
          }
        },
        "required": [
          "_tag"
        ],
        "additionalProperties": true
      }
    }
  }
  ```

- `Unmet`

  ```json
  {
    "$ref": "#/$defs/UnmetEncoded",
    "$defs": {
      "UnmetEncoded": {
        "type": "object",
        "properties": {
          "_tag": {
            "type": "string",
            "enum": [
              "Unmet"
            ]
          }
        },
        "required": [
          "_tag"
        ],
        "additionalProperties": true
      }
    }
  }
  ```

- `Invalid`, shown beside `reserved`

  ```json
  {
    "$ref": "#/$defs/InvalidEncoded",
    "$defs": {
      "InvalidEncoded": {
        "type": "object",
        "properties": {
          "_tag": {
            "type": "string",
            "enum": [
              "Invalid"
            ]
          },
          "entity": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              },
              {
                "type": "null"
              }
            ]
          },
          "rule": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "message": {
            "type": "string"
          },
          "path": {
            "type": "array",
            "items": {
              "type": "string"
            }
          }
        },
        "required": [
          "_tag",
          "rule",
          "message",
          "path"
        ],
        "additionalProperties": true
      }
    }
  }
  ```

- `Forbidden`

  ```json
  {
    "$ref": "#/$defs/ForbiddenEncoded",
    "$defs": {
      "ForbiddenEncoded": {
        "type": "object",
        "properties": {
          "_tag": {
            "type": "string",
            "enum": [
              "Forbidden"
            ]
          }
        },
        "required": [
          "_tag"
        ],
        "additionalProperties": true
      }
    }
  }
  ```

- `NotFound`

  ```json
  {
    "$ref": "#/$defs/NotFoundEncoded",
    "$defs": {
      "NotFoundEncoded": {
        "type": "object",
        "properties": {
          "_tag": {
            "type": "string",
            "enum": [
              "NotFound"
            ]
          }
        },
        "required": [
          "_tag"
        ],
        "additionalProperties": true
      }
    }
  }
  ```

- `Reused`

  ```json
  {
    "$ref": "#/$defs/ReusedEncoded",
    "$defs": {
      "ReusedEncoded": {
        "type": "object",
        "properties": {
          "_tag": {
            "type": "string",
            "enum": [
              "Reused"
            ]
          },
          "operation": {
            "type": "string"
          }
        },
        "required": [
          "_tag",
          "operation"
        ],
        "additionalProperties": true
      }
    }
  }
  ```


## Views

- ShopApi/ProductRow: serves `Product` (`ownerId`, `name`, `status`, `stock`, `reserved`, `revision`), ordered by `revision`.
