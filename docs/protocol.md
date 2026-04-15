# Extension Protocol Catalog

**Generated file.** Edit source schemas at `src/background/messaging/schemas/**` and run `pnpm generate:protocol-schema`.

Schema version: 1.0.0
Total keys: 16

## Key Table

| Key | Handler | Broadcast-Only |
|---|---|---|
| `AUTH_SIGN_IN` | background | no |
| `AUTH_SIGN_OUT` | background | no |
| `AUTH_STATUS` | background | no |
| `AUTH_STATE_CHANGED` | background | yes |
| `INTENT_DETECTED` | background | no |
| `INTENT_GET` | background | no |
| `FILL_REQUEST` | background | no |
| `KEYWORDS_EXTRACT` | background | no |
| `HIGHLIGHT_APPLY` | content | no |
| `HIGHLIGHT_CLEAR` | content | no |
| `HIGHLIGHT_STATUS` | background | no |
| `GENERATION_START` | background | no |
| `GENERATION_UPDATE` | background | yes |
| `GENERATION_CANCEL` | background | no |
| `DETECTED_JOB_BROADCAST` | background | yes |
| `CREDITS_GET` | background | no |

## Request / Response Shapes

### AUTH_SIGN_IN

Handler: background. Broadcast-only: false.

Request schema:
```json
{
  "type": "object",
  "properties": {
    "cookieJar": {
      "type": "string",
      "maxLength": 16384
    }
  },
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

Response schema:
```json
{
  "description": "AuthSignInResponse",
  "$schema": "http://json-schema.org/draft-07/schema#",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "ok": {
          "type": "boolean",
          "const": true
        },
        "userId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        }
      },
      "required": [
        "ok",
        "userId"
      ],
      "additionalProperties": false
    },
    {
      "type": "object",
      "properties": {
        "ok": {
          "type": "boolean",
          "const": false
        },
        "reason": {
          "type": "string",
          "maxLength": 500
        }
      },
      "required": [
        "ok",
        "reason"
      ],
      "additionalProperties": false
    }
  ],
  "discriminator": {
    "propertyName": "ok"
  }
}
```

### AUTH_SIGN_OUT

Handler: background. Broadcast-only: false.

Request schema:
```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

Response schema:
```json
{
  "type": "object",
  "properties": {
    "ok": {
      "type": "boolean"
    }
  },
  "required": [
    "ok"
  ],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

### AUTH_STATUS

Handler: background. Broadcast-only: false.

Request schema:
```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

Response schema:
```json
{
  "description": "AuthState",
  "$schema": "http://json-schema.org/draft-07/schema#",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "signedIn": {
          "type": "boolean",
          "const": true
        },
        "userId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        }
      },
      "required": [
        "signedIn",
        "userId"
      ],
      "additionalProperties": false
    },
    {
      "type": "object",
      "properties": {
        "signedIn": {
          "type": "boolean",
          "const": false
        }
      },
      "required": [
        "signedIn"
      ],
      "additionalProperties": false
    }
  ],
  "discriminator": {
    "propertyName": "signedIn"
  }
}
```

### AUTH_STATE_CHANGED

Handler: background. Broadcast-only: true.

Request schema:
```json
{
  "description": "AuthState",
  "$schema": "http://json-schema.org/draft-07/schema#",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "signedIn": {
          "type": "boolean",
          "const": true
        },
        "userId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        }
      },
      "required": [
        "signedIn",
        "userId"
      ],
      "additionalProperties": false
    },
    {
      "type": "object",
      "properties": {
        "signedIn": {
          "type": "boolean",
          "const": false
        }
      },
      "required": [
        "signedIn"
      ],
      "additionalProperties": false
    }
  ],
  "discriminator": {
    "propertyName": "signedIn"
  }
}
```

Response schema:
```json
null
```

### INTENT_DETECTED

Handler: background. Broadcast-only: false.

Request schema:
```json
{
  "type": "object",
  "properties": {
    "tabId": {
      "type": "integer"
    },
    "url": {
      "type": "string",
      "format": "uri",
      "maxLength": 2048
    },
    "kind": {
      "type": "string",
      "enum": [
        "greenhouse",
        "lever",
        "workday",
        "unknown"
      ]
    },
    "pageKind": {
      "type": "string",
      "enum": [
        "job-posting",
        "application-form"
      ]
    },
    "company": {
      "type": "string",
      "maxLength": 500
    },
    "jobTitle": {
      "type": "string",
      "maxLength": 500
    },
    "detectedAt": {
      "type": "integer",
      "minimum": 0
    }
  },
  "required": [
    "tabId",
    "url",
    "kind",
    "pageKind",
    "detectedAt"
  ],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

Response schema:
```json
null
```

### INTENT_GET

Handler: background. Broadcast-only: false.

Request schema:
```json
{
  "type": "object",
  "properties": {
    "tabId": {
      "type": "integer",
      "minimum": 0
    }
  },
  "required": [
    "tabId"
  ],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

Response schema:
```json
{
  "anyOf": [
    {
      "type": "object",
      "properties": {
        "kind": {
          "type": "string",
          "enum": [
            "greenhouse",
            "lever",
            "workday",
            "unknown"
          ]
        },
        "pageKind": {
          "type": "string",
          "enum": [
            "job-posting",
            "application-form"
          ]
        },
        "url": {
          "type": "string",
          "format": "uri",
          "maxLength": 2048
        },
        "jobTitle": {
          "type": "string",
          "maxLength": 500
        },
        "company": {
          "type": "string",
          "maxLength": 500
        },
        "detectedAt": {
          "type": "integer",
          "minimum": 0
        }
      },
      "required": [
        "kind",
        "pageKind",
        "url",
        "detectedAt"
      ],
      "additionalProperties": false
    },
    {
      "type": "null"
    }
  ],
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

### FILL_REQUEST

Handler: background. Broadcast-only: false.

Request schema:
```json
{
  "type": "object",
  "properties": {
    "tabId": {
      "type": "integer",
      "minimum": 0
    },
    "url": {
      "type": "string",
      "format": "uri",
      "maxLength": 2048
    }
  },
  "required": [
    "tabId",
    "url"
  ],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

Response schema:
```json
{
  "description": "FillRequestResponse",
  "$schema": "http://json-schema.org/draft-07/schema#",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "ok": {
          "type": "boolean",
          "const": true
        },
        "planId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        },
        "executedAt": {
          "type": "string",
          "maxLength": 64
        },
        "filled": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "ok": {
                "type": "boolean"
              },
              "selector": {
                "type": "string",
                "maxLength": 1000
              },
              "value": {
                "type": "string",
                "maxLength": 10000
              },
              "fieldType": {
                "type": "string",
                "maxLength": 64
              }
            },
            "required": [
              "ok",
              "selector",
              "value",
              "fieldType"
            ],
            "additionalProperties": false
          },
          "maxItems": 500
        },
        "skipped": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "ok": {
                "type": "boolean"
              },
              "selector": {
                "type": "string",
                "maxLength": 1000
              },
              "value": {
                "type": "string",
                "maxLength": 10000
              },
              "fieldType": {
                "type": "string",
                "maxLength": 64
              }
            },
            "required": [
              "ok",
              "selector",
              "value",
              "fieldType"
            ],
            "additionalProperties": false
          },
          "maxItems": 500
        },
        "failed": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "selector": {
                "type": "string",
                "maxLength": 1000
              },
              "reason": {
                "type": "string",
                "maxLength": 500
              }
            },
            "required": [
              "selector",
              "reason"
            ],
            "additionalProperties": false
          },
          "maxItems": 500
        },
        "aborted": {
          "type": "boolean",
          "const": false
        }
      },
      "required": [
        "ok",
        "planId",
        "executedAt",
        "filled",
        "skipped",
        "failed",
        "aborted"
      ],
      "additionalProperties": false
    },
    {
      "type": "object",
      "properties": {
        "ok": {
          "type": "boolean",
          "const": false
        },
        "aborted": {
          "type": "boolean",
          "const": true
        },
        "abortReason": {
          "type": "string",
          "enum": [
            "profile-missing",
            "no-adapter",
            "no-form",
            "scan-failed",
            "plan-failed",
            "content-script-not-loaded",
            "no-tab"
          ]
        }
      },
      "required": [
        "ok",
        "aborted",
        "abortReason"
      ],
      "additionalProperties": false
    }
  ],
  "discriminator": {
    "propertyName": "ok"
  }
}
```

### KEYWORDS_EXTRACT

Handler: background. Broadcast-only: false.

Request schema:
```json
{
  "type": "object",
  "properties": {
    "text": {
      "type": "string",
      "minLength": 1,
      "maxLength": 50000
    },
    "url": {
      "type": "string",
      "format": "uri",
      "maxLength": 2048
    },
    "topK": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    }
  },
  "required": [
    "text",
    "url"
  ],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

Response schema:
```json
{
  "description": "KeywordsExtractResponse",
  "$schema": "http://json-schema.org/draft-07/schema#",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "ok": {
          "type": "boolean",
          "const": true
        },
        "keywords": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "term": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              },
              "category": {
                "type": "string",
                "enum": [
                  "hard",
                  "soft",
                  "tool",
                  "domain"
                ]
              },
              "score": {
                "type": "number",
                "minimum": 0,
                "maximum": 1
              },
              "occurrences": {
                "type": "integer",
                "minimum": 0
              },
              "canonicalForm": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              }
            },
            "required": [
              "term",
              "category",
              "score",
              "occurrences",
              "canonicalForm"
            ],
            "additionalProperties": false
          },
          "maxItems": 500
        },
        "tookMs": {
          "type": "integer",
          "minimum": 0
        }
      },
      "required": [
        "ok",
        "keywords",
        "tookMs"
      ],
      "additionalProperties": false
    },
    {
      "type": "object",
      "properties": {
        "ok": {
          "type": "boolean",
          "const": false
        },
        "reason": {
          "type": "string",
          "enum": [
            "signed-out",
            "empty-text",
            "api-error",
            "rate-limited",
            "network-error"
          ]
        }
      },
      "required": [
        "ok",
        "reason"
      ],
      "additionalProperties": false
    }
  ],
  "discriminator": {
    "propertyName": "ok"
  }
}
```

### HIGHLIGHT_APPLY

Handler: content. Broadcast-only: false.

Request schema:
```json
{
  "type": "object",
  "properties": {
    "tabId": {
      "type": "integer",
      "minimum": 0
    }
  },
  "required": [
    "tabId"
  ],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

Response schema:
```json
{
  "description": "HighlightApplyResponse",
  "$schema": "http://json-schema.org/draft-07/schema#",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "ok": {
          "type": "boolean",
          "const": true
        },
        "keywordCount": {
          "type": "integer",
          "minimum": 0
        },
        "rangeCount": {
          "type": "integer",
          "minimum": 0
        },
        "tookMs": {
          "type": "integer",
          "minimum": 0
        }
      },
      "required": [
        "ok",
        "keywordCount",
        "rangeCount",
        "tookMs"
      ],
      "additionalProperties": false
    },
    {
      "type": "object",
      "properties": {
        "ok": {
          "type": "boolean",
          "const": false
        },
        "reason": {
          "type": "string",
          "enum": [
            "signed-out",
            "no-jd-on-page",
            "not-a-job-posting",
            "api-error",
            "rate-limited",
            "network-error",
            "no-tab",
            "render-error"
          ]
        }
      },
      "required": [
        "ok",
        "reason"
      ],
      "additionalProperties": false
    }
  ],
  "discriminator": {
    "propertyName": "ok"
  }
}
```

### HIGHLIGHT_CLEAR

Handler: content. Broadcast-only: false.

Request schema:
```json
{
  "type": "object",
  "properties": {
    "tabId": {
      "type": "integer",
      "minimum": 0
    }
  },
  "required": [
    "tabId"
  ],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

Response schema:
```json
{
  "description": "HighlightClearResponse",
  "$schema": "http://json-schema.org/draft-07/schema#",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "ok": {
          "type": "boolean",
          "const": true
        },
        "cleared": {
          "type": "boolean"
        }
      },
      "required": [
        "ok",
        "cleared"
      ],
      "additionalProperties": false
    },
    {
      "type": "object",
      "properties": {
        "ok": {
          "type": "boolean",
          "const": false
        },
        "reason": {
          "type": "string",
          "maxLength": 500
        }
      },
      "required": [
        "ok",
        "reason"
      ],
      "additionalProperties": false
    }
  ],
  "discriminator": {
    "propertyName": "ok"
  }
}
```

### HIGHLIGHT_STATUS

Handler: background. Broadcast-only: false.

Request schema:
```json
{
  "type": "object",
  "properties": {
    "tabId": {
      "type": "integer",
      "minimum": 0
    }
  },
  "required": [
    "tabId"
  ],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

Response schema:
```json
{
  "type": "object",
  "properties": {
    "on": {
      "type": "boolean"
    },
    "keywordCount": {
      "type": "integer",
      "minimum": 0
    },
    "appliedAt": {
      "anyOf": [
        {
          "type": "integer"
        },
        {
          "type": "null"
        }
      ]
    }
  },
  "required": [
    "on",
    "keywordCount",
    "appliedAt"
  ],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

### GENERATION_START

Handler: background. Broadcast-only: false.

Request schema:
```json
{
  "type": "object",
  "properties": {
    "agent": {
      "type": "string",
      "enum": [
        "job-hunter",
        "b2b-sales"
      ]
    },
    "payload": {}
  },
  "required": [
    "agent"
  ],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

Response schema:
```json
{
  "description": "GenerationStartResponse",
  "$schema": "http://json-schema.org/draft-07/schema#",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "ok": {
          "type": "boolean",
          "const": true
        },
        "generationId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        },
        "sessionId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        }
      },
      "required": [
        "ok",
        "generationId",
        "sessionId"
      ],
      "additionalProperties": false
    },
    {
      "type": "object",
      "properties": {
        "ok": {
          "type": "boolean",
          "const": false
        },
        "reason": {
          "type": "string",
          "maxLength": 500
        }
      },
      "required": [
        "ok",
        "reason"
      ],
      "additionalProperties": false
    }
  ],
  "discriminator": {
    "propertyName": "ok"
  }
}
```

### GENERATION_UPDATE

Handler: background. Broadcast-only: true.

Request schema:
```json
{
  "type": "object",
  "properties": {
    "generationId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 128
    },
    "sessionId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 128
    },
    "phase": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "status": {
      "type": "string",
      "enum": [
        "running",
        "completed",
        "failed",
        "awaiting_input",
        "cancelled"
      ]
    },
    "progress": {
      "type": "number",
      "minimum": 0,
      "maximum": 1
    },
    "interactionType": {
      "type": "string",
      "maxLength": 100
    },
    "artifacts": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "kind": {
            "type": "string",
            "enum": [
              "cv",
              "cover-letter",
              "email",
              "other"
            ]
          },
          "content": {
            "type": "string",
            "maxLength": 1000000
          },
          "metadata": {
            "type": "object",
            "additionalProperties": {}
          }
        },
        "required": [
          "kind",
          "content"
        ],
        "additionalProperties": false
      },
      "maxItems": 20
    }
  },
  "required": [
    "generationId",
    "sessionId",
    "phase",
    "status"
  ],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

Response schema:
```json
null
```

### GENERATION_CANCEL

Handler: background. Broadcast-only: false.

Request schema:
```json
{
  "type": "object",
  "properties": {
    "generationId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 128
    }
  },
  "required": [
    "generationId"
  ],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

Response schema:
```json
{
  "type": "object",
  "properties": {
    "ok": {
      "type": "boolean"
    }
  },
  "required": [
    "ok"
  ],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

### DETECTED_JOB_BROADCAST

Handler: background. Broadcast-only: true.

Request schema:
```json
{
  "type": "object",
  "properties": {
    "tabId": {
      "type": "integer",
      "minimum": 0
    },
    "intent": {
      "type": "object",
      "properties": {
        "kind": {
          "type": "string",
          "enum": [
            "greenhouse",
            "lever",
            "workday",
            "unknown"
          ]
        },
        "pageKind": {
          "type": "string",
          "enum": [
            "job-posting",
            "application-form"
          ]
        },
        "url": {
          "type": "string",
          "format": "uri",
          "maxLength": 2048
        },
        "jobTitle": {
          "type": "string",
          "maxLength": 500
        },
        "company": {
          "type": "string",
          "maxLength": 500
        },
        "detectedAt": {
          "type": "integer",
          "minimum": 0
        }
      },
      "required": [
        "kind",
        "pageKind",
        "url",
        "detectedAt"
      ],
      "additionalProperties": false
    }
  },
  "required": [
    "tabId",
    "intent"
  ],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

Response schema:
```json
null
```

### CREDITS_GET

Handler: background. Broadcast-only: false.

Request schema:
```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

Response schema:
```json
{
  "type": "object",
  "properties": {
    "balance": {
      "type": "number",
      "minimum": 0,
      "maximum": 1000000000
    },
    "plan": {
      "type": "string",
      "minLength": 1,
      "maxLength": 64
    },
    "resetAt": {
      "anyOf": [
        {
          "type": "integer"
        },
        {
          "type": "null"
        }
      ]
    }
  },
  "required": [
    "balance",
    "plan",
    "resetAt"
  ],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

