# Extension Protocol Catalog

**Generated file.** Edit source schemas at `src/background/messaging/schemas/**` and run `pnpm generate:protocol-schema`.

Schema version: 1.0.0
Total keys: 27

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
| `GENERATION_SUBSCRIBE` | background | no |
| `GENERATION_INTERACT` | background | no |
| `GENERATION_STARTED` | background | yes |
| `GENERATION_COMPLETE` | background | yes |
| `DETECTED_JOB_BROADCAST` | background | yes |
| `CREDITS_GET` | background | no |
| `PROFILE_GET` | background | no |
| `SESSION_LIST` | background | no |
| `SESSION_GET` | background | no |
| `SESSION_HYDRATE_GET` | background | no |
| `SESSION_BINDING_PUT` | background | no |
| `SESSION_BINDING_GET` | background | no |
| `GENERIC_INTENT_DETECT` | background | no |

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
    },
    "agent": {
      "type": "string",
      "enum": [
        "job-hunter",
        "b2b-sales"
      ]
    },
    "interactive": {
      "type": "boolean"
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
    },
    "resumeAttachment": {
      "type": "object",
      "properties": {
        "fileName": {
          "type": "string",
          "minLength": 1,
          "maxLength": 255
        },
        "mimeType": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "contentBase64": {
          "type": "string",
          "minLength": 1,
          "maxLength": 4000000
        }
      },
      "required": [
        "fileName",
        "mimeType",
        "contentBase64"
      ],
      "additionalProperties": false
    },
    "profileData": {
      "type": "object",
      "additionalProperties": {}
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
    },
    "rawPageText": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200000
    },
    "hostname": {
      "type": "string",
      "maxLength": 256
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
            "minLength": 1,
            "maxLength": 100
          },
          "type": {
            "type": "string",
            "minLength": 1,
            "maxLength": 100
          },
          "content": {
            "type": "string",
            "maxLength": 1000000
          },
          "payload": {
            "type": "object",
            "additionalProperties": {}
          },
          "metadata": {
            "type": "object",
            "additionalProperties": {}
          },
          "mimeType": {
            "type": "string",
            "maxLength": 200
          },
          "storageKey": {
            "type": "string",
            "maxLength": 2000
          },
          "downloadUrl": {
            "type": "string",
            "maxLength": 4000
          }
        },
        "additionalProperties": true
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

### GENERATION_SUBSCRIBE

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
  "anyOf": [
    {
      "type": "object",
      "properties": {
        "ok": {
          "type": "boolean",
          "const": true
        }
      },
      "required": [
        "ok"
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
            "network-error",
            "already-subscribed"
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
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

### GENERATION_INTERACT

Handler: background. Broadcast-only: false.

Request schema:
```json
{
  "type": "object",
  "properties": {
    "agentType": {
      "type": "string",
      "enum": [
        "job-hunter",
        "b2b-sales"
      ]
    },
    "generationId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 128
    },
    "interactionId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 128
    },
    "interactionType": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "interactionData": {}
  },
  "required": [
    "agentType",
    "generationId",
    "interactionId",
    "interactionType"
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
        "ok": {
          "type": "boolean",
          "const": true
        }
      },
      "required": [
        "ok"
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
            "not-found",
            "network-error",
            "api-error",
            "invalid-payload"
          ]
        },
        "status": {
          "type": "integer"
        }
      },
      "required": [
        "ok",
        "reason"
      ],
      "additionalProperties": false
    }
  ],
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

### GENERATION_STARTED

Handler: background. Broadcast-only: true.

Request schema:
```json
null
```

Response schema:
```json
null
```

### GENERATION_COMPLETE

Handler: background. Broadcast-only: true.

Request schema:
```json
null
```

Response schema:
```json
null
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
    "credits": {
      "type": "number",
      "minimum": 0,
      "maximum": 1000000000
    },
    "tier": {
      "type": "string",
      "enum": [
        "free",
        "byo"
      ]
    },
    "byoKeyEnabled": {
      "type": "boolean"
    }
  },
  "required": [
    "credits",
    "tier",
    "byoKeyEnabled"
  ],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

### PROFILE_GET

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
    "email": {
      "type": [
        "string",
        "null"
      ]
    },
    "displayName": {
      "type": [
        "string",
        "null"
      ]
    },
    "photoURL": {
      "type": [
        "string",
        "null"
      ]
    }
  },
  "required": [
    "email",
    "displayName",
    "photoURL"
  ],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

### SESSION_LIST

Handler: background. Broadcast-only: false.

Request schema:
```json
{
  "type": "object",
  "properties": {
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 50
    },
    "cursor": {
      "type": "string",
      "minLength": 1,
      "maxLength": 128
    },
    "forceRefresh": {
      "type": "boolean"
    }
  },
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
        "ok": {
          "type": "boolean",
          "const": true
        },
        "items": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "sessionId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 128
              },
              "agentType": {
                "type": "string",
                "enum": [
                  "job-hunter",
                  "b2b-sales"
                ]
              },
              "status": {
                "type": "string",
                "enum": [
                  "active",
                  "completed",
                  "failed",
                  "awaiting_input",
                  "cancelled"
                ]
              },
              "companyName": {
                "anyOf": [
                  {
                    "type": "string",
                    "maxLength": 500
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "jobTitle": {
                "anyOf": [
                  {
                    "type": "string",
                    "maxLength": 500
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "createdAt": {
                "type": "integer",
                "minimum": 0
              },
              "updatedAt": {
                "type": "integer",
                "minimum": 0
              },
              "completedAt": {
                "anyOf": [
                  {
                    "type": "integer",
                    "minimum": 0
                  },
                  {
                    "type": "null"
                  }
                ]
              }
            },
            "required": [
              "sessionId",
              "agentType",
              "status",
              "createdAt",
              "updatedAt"
            ],
            "additionalProperties": false
          },
          "maxItems": 200
        },
        "hasMore": {
          "type": "boolean"
        },
        "nextCursor": {
          "type": [
            "string",
            "null"
          ]
        },
        "fetchedAt": {
          "type": "integer",
          "minimum": 0
        },
        "fromCache": {
          "type": "boolean"
        }
      },
      "required": [
        "ok",
        "items",
        "hasMore",
        "nextCursor",
        "fetchedAt",
        "fromCache"
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
            "network-error",
            "api-error",
            "shape-mismatch"
          ]
        },
        "status": {
          "type": "integer"
        }
      },
      "required": [
        "ok",
        "reason"
      ],
      "additionalProperties": false
    }
  ],
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

### SESSION_GET

Handler: background. Broadcast-only: false.

Request schema:
```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 128
    }
  },
  "required": [
    "sessionId"
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
        "ok": {
          "type": "boolean",
          "const": true
        },
        "session": {
          "type": "object",
          "properties": {
            "sessionId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 128
            },
            "agentType": {
              "type": "string",
              "enum": [
                "job-hunter",
                "b2b-sales"
              ]
            },
            "status": {
              "type": "string",
              "enum": [
                "active",
                "completed",
                "failed",
                "awaiting_input",
                "cancelled"
              ]
            },
            "companyName": {
              "anyOf": [
                {
                  "type": "string",
                  "maxLength": 500
                },
                {
                  "type": "null"
                }
              ]
            },
            "jobTitle": {
              "anyOf": [
                {
                  "type": "string",
                  "maxLength": 500
                },
                {
                  "type": "null"
                }
              ]
            },
            "createdAt": {
              "type": "integer",
              "minimum": 0
            },
            "updatedAt": {
              "type": "integer",
              "minimum": 0
            },
            "completedAt": {
              "anyOf": [
                {
                  "type": "integer",
                  "minimum": 0
                },
                {
                  "type": "null"
                }
              ]
            }
          },
          "required": [
            "sessionId",
            "agentType",
            "status",
            "createdAt",
            "updatedAt"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "ok",
        "session"
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
            "not-found",
            "network-error",
            "api-error",
            "shape-mismatch"
          ]
        },
        "status": {
          "type": "integer"
        }
      },
      "required": [
        "ok",
        "reason"
      ],
      "additionalProperties": false
    }
  ],
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

### SESSION_HYDRATE_GET

Handler: background. Broadcast-only: false.

Request schema:
```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 128
    }
  },
  "required": [
    "sessionId"
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
        "ok": {
          "type": "boolean",
          "const": true
        },
        "payload": {
          "type": "object",
          "properties": {
            "session": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string"
                },
                "_id": {
                  "type": "string"
                },
                "status": {
                  "type": "string"
                },
                "metadata": {
                  "type": "object",
                  "additionalProperties": {}
                },
                "updatedAt": {
                  "type": [
                    "string",
                    "number"
                  ]
                }
              },
              "additionalProperties": true
            },
            "artifacts": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string"
                  },
                  "storageKey": {
                    "type": "string"
                  },
                  "label": {
                    "type": "string"
                  },
                  "name": {
                    "type": "string"
                  }
                },
                "required": [
                  "type"
                ],
                "additionalProperties": true
              }
            },
            "generationLogs": {
              "type": "array",
              "items": {}
            }
          },
          "required": [
            "session"
          ],
          "additionalProperties": true
        }
      },
      "required": [
        "ok",
        "payload"
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
            "not-found",
            "network-error",
            "api-error",
            "shape-mismatch"
          ]
        },
        "status": {
          "type": "integer"
        }
      },
      "required": [
        "ok",
        "reason"
      ],
      "additionalProperties": false
    }
  ],
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

### SESSION_BINDING_PUT

Handler: background. Broadcast-only: false.

Request schema:
```json
{
  "type": "object",
  "properties": {
    "url": {
      "type": "string",
      "minLength": 1,
      "maxLength": 2048
    },
    "agentId": {
      "type": "string",
      "enum": [
        "job-hunter",
        "b2b-sales"
      ]
    },
    "sessionId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 128
    },
    "generationId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 128
    },
    "pageTitle": {
      "type": "string",
      "maxLength": 500
    }
  },
  "required": [
    "url",
    "agentId",
    "sessionId",
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

### SESSION_BINDING_GET

Handler: background. Broadcast-only: false.

Request schema:
```json
{
  "type": "object",
  "properties": {
    "url": {
      "type": "string",
      "minLength": 1,
      "maxLength": 2048
    },
    "agentId": {
      "type": "string",
      "enum": [
        "job-hunter",
        "b2b-sales"
      ]
    },
    "jobTitle": {
      "type": "string"
    },
    "companyName": {
      "type": "string"
    }
  },
  "required": [
    "url",
    "agentId"
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
        "sessionId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        },
        "generationId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        },
        "agentId": {
          "type": "string",
          "enum": [
            "job-hunter",
            "b2b-sales"
          ]
        },
        "urlKey": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        "pageTitle": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 500
            },
            {
              "type": "null"
            }
          ]
        },
        "createdAt": {
          "type": "integer",
          "minimum": 0
        },
        "updatedAt": {
          "type": "integer",
          "minimum": 0
        }
      },
      "required": [
        "sessionId",
        "generationId",
        "agentId",
        "urlKey",
        "pageTitle",
        "createdAt",
        "updatedAt"
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

### GENERIC_INTENT_DETECT

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
    "agent": {
      "type": "string",
      "enum": [
        "job-hunter",
        "b2b-sales"
      ]
    }
  },
  "required": [
    "tabId",
    "agent"
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
        "ok": {
          "type": "boolean",
          "const": true
        },
        "result": {
          "anyOf": [
            {
              "type": "object",
              "properties": {
                "kind": {
                  "type": "string",
                  "const": "job-description"
                },
                "text": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 100000
                },
                "method": {
                  "type": "string",
                  "enum": [
                    "jsonld",
                    "readability"
                  ]
                },
                "jobTitle": {
                  "type": "string",
                  "maxLength": 500
                },
                "company": {
                  "type": "string",
                  "maxLength": 500
                },
                "url": {
                  "type": "string",
                  "format": "uri",
                  "maxLength": 2048
                }
              },
              "required": [
                "kind",
                "text",
                "method",
                "url"
              ],
              "additionalProperties": false
            },
            {
              "type": "object",
              "properties": {
                "kind": {
                  "type": "string",
                  "const": "company-page"
                },
                "url": {
                  "type": "string",
                  "format": "uri",
                  "maxLength": 2048
                },
                "signals": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "enum": [
                      "jsonld-organization",
                      "about-link",
                      "contact-link",
                      "corp-host"
                    ]
                  },
                  "maxItems": 8
                },
                "companyName": {
                  "type": "string",
                  "maxLength": 500
                }
              },
              "required": [
                "kind",
                "url",
                "signals"
              ],
              "additionalProperties": false
            }
          ]
        }
      },
      "required": [
        "ok",
        "result"
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
            "no-match",
            "no-tab",
            "script-inject-failed",
            "invalid-payload",
            "permission-denied"
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
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

