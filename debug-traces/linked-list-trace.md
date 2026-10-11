STEP 1 / 24
LINE: 12
CODE: public ListNode reverseList(ListNode head) {
EVENT: METHOD_ENTER
METHOD: reverseList
DEPTH: 1
CONDITION: —
EXECUTION EVENTS:
[]
VARIABLES:
{
  "head": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "297",
            "$type": "ListNode",
            "fields": {
              "val": 3,
              "next": null
            }
          }
        }
      }
    }
  },
  "this": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
ARRAYS:
{}
DATA STRUCTURES:
{}
OBJECTS:
{
  "294": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "297",
            "$type": "ListNode",
            "fields": {
              "val": 3,
              "next": null
            }
          }
        }
      }
    }
  },
  "296": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "297",
        "$type": "ListNode",
        "fields": {
          "val": 3,
          "next": null
        }
      }
    }
  },
  "297": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": null
    }
  },
  "298": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
CALL STACK:
[
  "reverseList"
]
LAST EVENT DATA:
{
  "variables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "297",
              "$type": "ListNode",
              "fields": {
                "val": 3,
                "next": null
              }
            }
          }
        }
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "displayLine": 12
}

================================================================================

STEP 2 / 24
LINE: 13
CODE: ListNode prev = null;
EVENT: STEP
METHOD: reverseList
DEPTH: 1
CONDITION: —
EXECUTION EVENTS:
[
  {
    "sequence": 0,
    "type": "VARIABLE_UPDATE",
    "line": 13,
    "method": "reverseList",
    "depth": 1,
    "data": {
      "name": "prev",
      "value": null
    }
  }
]
VARIABLES:
{
  "head": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "297",
            "$type": "ListNode",
            "fields": {
              "val": 3,
              "next": null
            }
          }
        }
      }
    }
  },
  "prev": null,
  "this": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
ARRAYS:
{}
DATA STRUCTURES:
{}
OBJECTS:
{
  "294": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "297",
            "$type": "ListNode",
            "fields": {
              "val": 3,
              "next": null
            }
          }
        }
      }
    }
  },
  "296": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "297",
        "$type": "ListNode",
        "fields": {
          "val": 3,
          "next": null
        }
      }
    }
  },
  "297": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": null
    }
  },
  "298": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
CALL STACK:
[
  "reverseList"
]
LAST EVENT DATA:
{
  "variables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "297",
              "$type": "ListNode",
              "fields": {
                "val": 3,
                "next": null
              }
            }
          }
        }
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "arrayReferences": [],
  "postVariables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "297",
              "$type": "ListNode",
              "fields": {
                "val": 3,
                "next": null
              }
            }
          }
        }
      }
    },
    "prev": null,
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "executionEvents": [
    {
      "sequence": 0,
      "type": "VARIABLE_UPDATE",
      "line": 13,
      "method": "reverseList",
      "depth": 1,
      "data": {
        "name": "prev",
        "value": null
      }
    }
  ],
  "semanticRoles": [
    {
      "name": "prev",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "prev is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used to compute next",
        "derived from curr",
        "contributes to the returned expression"
      ],
      "method": "reverseList"
    }
  ]
}

================================================================================

STEP 3 / 24
LINE: 14
CODE: ListNode curr = head;
EVENT: STEP
METHOD: reverseList
DEPTH: 1
CONDITION: —
EXECUTION EVENTS:
[
  {
    "sequence": 0,
    "type": "VARIABLE_UPDATE",
    "line": 14,
    "method": "reverseList",
    "depth": 1,
    "data": {
      "name": "curr",
      "value": {
        "$objectId": "294",
        "$type": "ListNode",
        "fields": {
          "val": 1,
          "next": {
            "$objectId": "296",
            "$type": "ListNode",
            "fields": {
              "val": 2,
              "next": {
                "$objectId": "297",
                "$type": "ListNode",
                "fields": {
                  "val": 3,
                  "next": null
                }
              }
            }
          }
        }
      }
    }
  }
]
VARIABLES:
{
  "head": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "297",
            "$type": "ListNode",
            "fields": {
              "val": 3,
              "next": null
            }
          }
        }
      }
    }
  },
  "prev": null,
  "curr": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "297",
            "$type": "ListNode",
            "fields": {
              "val": 3,
              "next": null
            }
          }
        }
      }
    }
  },
  "this": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
ARRAYS:
{}
DATA STRUCTURES:
{}
OBJECTS:
{
  "294": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "297",
            "$type": "ListNode",
            "fields": {
              "val": 3,
              "next": null
            }
          }
        }
      }
    }
  },
  "296": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "297",
        "$type": "ListNode",
        "fields": {
          "val": 3,
          "next": null
        }
      }
    }
  },
  "297": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": null
    }
  },
  "298": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
CALL STACK:
[
  "reverseList"
]
LAST EVENT DATA:
{
  "variables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "297",
              "$type": "ListNode",
              "fields": {
                "val": 3,
                "next": null
              }
            }
          }
        }
      }
    },
    "prev": null,
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "arrayReferences": [],
  "postVariables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "297",
              "$type": "ListNode",
              "fields": {
                "val": 3,
                "next": null
              }
            }
          }
        }
      }
    },
    "prev": null,
    "curr": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "297",
              "$type": "ListNode",
              "fields": {
                "val": 3,
                "next": null
              }
            }
          }
        }
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "executionEvents": [
    {
      "sequence": 0,
      "type": "VARIABLE_UPDATE",
      "line": 14,
      "method": "reverseList",
      "depth": 1,
      "data": {
        "name": "curr",
        "value": {
          "$objectId": "294",
          "$type": "ListNode",
          "fields": {
            "val": 1,
            "next": {
              "$objectId": "296",
              "$type": "ListNode",
              "fields": {
                "val": 2,
                "next": {
                  "$objectId": "297",
                  "$type": "ListNode",
                  "fields": {
                    "val": 3,
                    "next": null
                  }
                }
              }
            }
          }
        }
      }
    }
  ],
  "semanticRoles": [
    {
      "name": "curr",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "curr is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used in a condition",
        "derived from head, next",
        "used to compute next",
        "used to compute prev"
      ],
      "method": "reverseList"
    },
    {
      "name": "prev",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "prev is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used to compute next",
        "derived from curr",
        "contributes to the returned expression"
      ],
      "method": "reverseList"
    }
  ]
}

================================================================================

STEP 4 / 24
LINE: 16
CODE: while(curr != null){
EVENT: STEP
METHOD: reverseList
DEPTH: 1
CONDITION: TRUE
EXECUTION EVENTS:
[]
VARIABLES:
{
  "head": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "297",
            "$type": "ListNode",
            "fields": {
              "val": 3,
              "next": null
            }
          }
        }
      }
    }
  },
  "prev": null,
  "curr": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "297",
            "$type": "ListNode",
            "fields": {
              "val": 3,
              "next": null
            }
          }
        }
      }
    }
  },
  "this": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
ARRAYS:
{}
DATA STRUCTURES:
{}
OBJECTS:
{
  "294": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "297",
            "$type": "ListNode",
            "fields": {
              "val": 3,
              "next": null
            }
          }
        }
      }
    }
  },
  "296": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "297",
        "$type": "ListNode",
        "fields": {
          "val": 3,
          "next": null
        }
      }
    }
  },
  "297": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": null
    }
  },
  "298": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
CALL STACK:
[
  "reverseList"
]
LAST EVENT DATA:
{
  "variables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "297",
              "$type": "ListNode",
              "fields": {
                "val": 3,
                "next": null
              }
            }
          }
        }
      }
    },
    "prev": null,
    "curr": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "297",
              "$type": "ListNode",
              "fields": {
                "val": 3,
                "next": null
              }
            }
          }
        }
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "arrayReferences": [],
  "conditionResult": true,
  "postVariables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "297",
              "$type": "ListNode",
              "fields": {
                "val": 3,
                "next": null
              }
            }
          }
        }
      }
    },
    "prev": null,
    "curr": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "297",
              "$type": "ListNode",
              "fields": {
                "val": 3,
                "next": null
              }
            }
          }
        }
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "semanticRoles": [
    {
      "name": "curr",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "curr is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used in a condition",
        "derived from head, next",
        "used to compute next",
        "used to compute prev"
      ],
      "method": "reverseList"
    },
    {
      "name": "prev",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "prev is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used to compute next",
        "derived from curr",
        "contributes to the returned expression"
      ],
      "method": "reverseList"
    }
  ]
}

================================================================================

STEP 5 / 24
LINE: 17
CODE: ListNode next = curr.next;
EVENT: STEP
METHOD: reverseList
DEPTH: 1
CONDITION: —
EXECUTION EVENTS:
[
  {
    "sequence": 0,
    "type": "VARIABLE_UPDATE",
    "line": 17,
    "method": "reverseList",
    "depth": 1,
    "data": {
      "name": "next",
      "value": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "297",
            "$type": "ListNode",
            "fields": {
              "val": 3,
              "next": null
            }
          }
        }
      }
    }
  }
]
VARIABLES:
{
  "head": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "297",
            "$type": "ListNode",
            "fields": {
              "val": 3,
              "next": null
            }
          }
        }
      }
    }
  },
  "prev": null,
  "curr": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "297",
            "$type": "ListNode",
            "fields": {
              "val": 3,
              "next": null
            }
          }
        }
      }
    }
  },
  "next": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "297",
        "$type": "ListNode",
        "fields": {
          "val": 3,
          "next": null
        }
      }
    }
  },
  "this": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
ARRAYS:
{}
DATA STRUCTURES:
{}
OBJECTS:
{
  "294": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "297",
            "$type": "ListNode",
            "fields": {
              "val": 3,
              "next": null
            }
          }
        }
      }
    }
  },
  "296": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "297",
        "$type": "ListNode",
        "fields": {
          "val": 3,
          "next": null
        }
      }
    }
  },
  "297": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": null
    }
  },
  "298": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
CALL STACK:
[
  "reverseList"
]
LAST EVENT DATA:
{
  "variables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "297",
              "$type": "ListNode",
              "fields": {
                "val": 3,
                "next": null
              }
            }
          }
        }
      }
    },
    "prev": null,
    "curr": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "297",
              "$type": "ListNode",
              "fields": {
                "val": 3,
                "next": null
              }
            }
          }
        }
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "arrayReferences": [],
  "postVariables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "297",
              "$type": "ListNode",
              "fields": {
                "val": 3,
                "next": null
              }
            }
          }
        }
      }
    },
    "prev": null,
    "curr": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "297",
              "$type": "ListNode",
              "fields": {
                "val": 3,
                "next": null
              }
            }
          }
        }
      }
    },
    "next": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "297",
          "$type": "ListNode",
          "fields": {
            "val": 3,
            "next": null
          }
        }
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "executionEvents": [
    {
      "sequence": 0,
      "type": "VARIABLE_UPDATE",
      "line": 17,
      "method": "reverseList",
      "depth": 1,
      "data": {
        "name": "next",
        "value": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "297",
              "$type": "ListNode",
              "fields": {
                "val": 3,
                "next": null
              }
            }
          }
        }
      }
    }
  ],
  "semanticRoles": [
    {
      "name": "curr",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "curr is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used in a condition",
        "derived from head, next",
        "used to compute next",
        "used to compute prev"
      ],
      "method": "reverseList"
    },
    {
      "name": "prev",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "prev is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used to compute next",
        "derived from curr",
        "contributes to the returned expression"
      ],
      "method": "reverseList"
    }
  ]
}

================================================================================

STEP 6 / 24
LINE: 18
CODE: curr.next = prev;
EVENT: STEP
METHOD: reverseList
DEPTH: 1
CONDITION: —
EXECUTION EVENTS:
[
  {
    "sequence": 0,
    "type": "OBJECT_FIELD_WRITE",
    "line": 18,
    "method": "reverseList",
    "depth": 1,
    "data": {
      "name": "head",
      "objectId": "294",
      "changes": [
        {
          "fields": [
            "next"
          ],
          "before": {
            "$objectId": "296",
            "$type": "ListNode",
            "fields": {
              "val": 2,
              "next": {
                "$objectId": "297",
                "$type": "ListNode",
                "fields": {
                  "val": 3,
                  "next": null
                }
              }
            }
          },
          "after": null
        }
      ],
      "value": {
        "$objectId": "294",
        "$type": "ListNode",
        "fields": {
          "val": 1,
          "next": null
        }
      }
    }
  }
]
VARIABLES:
{
  "head": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "prev": null,
  "curr": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "next": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "297",
        "$type": "ListNode",
        "fields": {
          "val": 3,
          "next": null
        }
      }
    }
  },
  "this": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
ARRAYS:
{}
DATA STRUCTURES:
{}
OBJECTS:
{
  "294": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "296": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "297",
        "$type": "ListNode",
        "fields": {
          "val": 3,
          "next": null
        }
      }
    }
  },
  "297": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": null
    }
  },
  "298": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
CALL STACK:
[
  "reverseList"
]
LAST EVENT DATA:
{
  "variables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "297",
              "$type": "ListNode",
              "fields": {
                "val": 3,
                "next": null
              }
            }
          }
        }
      }
    },
    "prev": null,
    "curr": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "297",
              "$type": "ListNode",
              "fields": {
                "val": 3,
                "next": null
              }
            }
          }
        }
      }
    },
    "next": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "297",
          "$type": "ListNode",
          "fields": {
            "val": 3,
            "next": null
          }
        }
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "arrayReferences": [],
  "postVariables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": null,
    "curr": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "next": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "297",
          "$type": "ListNode",
          "fields": {
            "val": 3,
            "next": null
          }
        }
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "executionEvents": [
    {
      "sequence": 0,
      "type": "OBJECT_FIELD_WRITE",
      "line": 18,
      "method": "reverseList",
      "depth": 1,
      "data": {
        "name": "head",
        "objectId": "294",
        "changes": [
          {
            "fields": [
              "next"
            ],
            "before": {
              "$objectId": "296",
              "$type": "ListNode",
              "fields": {
                "val": 2,
                "next": {
                  "$objectId": "297",
                  "$type": "ListNode",
                  "fields": {
                    "val": 3,
                    "next": null
                  }
                }
              }
            },
            "after": null
          }
        ],
        "value": {
          "$objectId": "294",
          "$type": "ListNode",
          "fields": {
            "val": 1,
            "next": null
          }
        }
      }
    }
  ],
  "semanticRoles": [
    {
      "name": "curr",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "curr is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used in a condition",
        "derived from head, next",
        "used to compute next",
        "used to compute prev"
      ],
      "method": "reverseList"
    },
    {
      "name": "prev",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "prev is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used to compute next",
        "derived from curr",
        "contributes to the returned expression"
      ],
      "method": "reverseList"
    }
  ]
}

================================================================================

STEP 7 / 24
LINE: 19
CODE: prev = curr;
EVENT: STEP
METHOD: reverseList
DEPTH: 1
CONDITION: —
EXECUTION EVENTS:
[
  {
    "sequence": 0,
    "type": "VARIABLE_UPDATE",
    "line": 19,
    "method": "reverseList",
    "depth": 1,
    "data": {
      "name": "prev",
      "value": {
        "$objectId": "294",
        "$type": "ListNode",
        "fields": {
          "val": 1,
          "next": null
        }
      },
      "before": null
    }
  }
]
VARIABLES:
{
  "head": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "prev": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "curr": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "next": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "297",
        "$type": "ListNode",
        "fields": {
          "val": 3,
          "next": null
        }
      }
    }
  },
  "this": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
ARRAYS:
{}
DATA STRUCTURES:
{}
OBJECTS:
{
  "294": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "296": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "297",
        "$type": "ListNode",
        "fields": {
          "val": 3,
          "next": null
        }
      }
    }
  },
  "297": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": null
    }
  },
  "298": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
CALL STACK:
[
  "reverseList"
]
LAST EVENT DATA:
{
  "variables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": null,
    "curr": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "next": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "297",
          "$type": "ListNode",
          "fields": {
            "val": 3,
            "next": null
          }
        }
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "arrayReferences": [],
  "postVariables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "curr": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "next": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "297",
          "$type": "ListNode",
          "fields": {
            "val": 3,
            "next": null
          }
        }
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "executionEvents": [
    {
      "sequence": 0,
      "type": "VARIABLE_UPDATE",
      "line": 19,
      "method": "reverseList",
      "depth": 1,
      "data": {
        "name": "prev",
        "value": {
          "$objectId": "294",
          "$type": "ListNode",
          "fields": {
            "val": 1,
            "next": null
          }
        },
        "before": null
      }
    }
  ],
  "semanticRoles": [
    {
      "name": "curr",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "curr is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used in a condition",
        "derived from head, next",
        "used to compute next",
        "used to compute prev"
      ],
      "method": "reverseList"
    },
    {
      "name": "prev",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "prev is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used to compute next",
        "derived from curr",
        "contributes to the returned expression"
      ],
      "method": "reverseList"
    }
  ]
}

================================================================================

STEP 8 / 24
LINE: 20
CODE: curr = next;
EVENT: STEP
METHOD: reverseList
DEPTH: 1
CONDITION: —
EXECUTION EVENTS:
[
  {
    "sequence": 0,
    "type": "VARIABLE_UPDATE",
    "line": 20,
    "method": "reverseList",
    "depth": 1,
    "data": {
      "name": "curr",
      "value": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "297",
            "$type": "ListNode",
            "fields": {
              "val": 3,
              "next": null
            }
          }
        }
      },
      "before": {
        "$objectId": "294",
        "$type": "ListNode",
        "fields": {
          "val": 1,
          "next": null
        }
      }
    }
  }
]
VARIABLES:
{
  "head": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "prev": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "curr": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "297",
        "$type": "ListNode",
        "fields": {
          "val": 3,
          "next": null
        }
      }
    }
  },
  "this": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
ARRAYS:
{}
DATA STRUCTURES:
{}
OBJECTS:
{
  "294": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "296": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "297",
        "$type": "ListNode",
        "fields": {
          "val": 3,
          "next": null
        }
      }
    }
  },
  "297": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": null
    }
  },
  "298": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
CALL STACK:
[
  "reverseList"
]
LAST EVENT DATA:
{
  "variables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "curr": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "next": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "297",
          "$type": "ListNode",
          "fields": {
            "val": 3,
            "next": null
          }
        }
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "arrayReferences": [],
  "postVariables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "curr": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "297",
          "$type": "ListNode",
          "fields": {
            "val": 3,
            "next": null
          }
        }
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "executionEvents": [
    {
      "sequence": 0,
      "type": "VARIABLE_UPDATE",
      "line": 20,
      "method": "reverseList",
      "depth": 1,
      "data": {
        "name": "curr",
        "value": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "297",
              "$type": "ListNode",
              "fields": {
                "val": 3,
                "next": null
              }
            }
          }
        },
        "before": {
          "$objectId": "294",
          "$type": "ListNode",
          "fields": {
            "val": 1,
            "next": null
          }
        }
      }
    }
  ],
  "semanticRoles": [
    {
      "name": "curr",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "curr is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used in a condition",
        "derived from head, next",
        "used to compute next",
        "used to compute prev"
      ],
      "method": "reverseList"
    },
    {
      "name": "prev",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "prev is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used to compute next",
        "derived from curr",
        "contributes to the returned expression"
      ],
      "method": "reverseList"
    }
  ]
}

================================================================================

STEP 9 / 24
LINE: 21
CODE: }
EVENT: STEP
METHOD: reverseList
DEPTH: 1
CONDITION: —
EXECUTION EVENTS:
[]
VARIABLES:
{
  "head": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "prev": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "curr": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "297",
        "$type": "ListNode",
        "fields": {
          "val": 3,
          "next": null
        }
      }
    }
  },
  "this": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
ARRAYS:
{}
DATA STRUCTURES:
{}
OBJECTS:
{
  "294": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "296": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "297",
        "$type": "ListNode",
        "fields": {
          "val": 3,
          "next": null
        }
      }
    }
  },
  "297": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": null
    }
  },
  "298": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
CALL STACK:
[
  "reverseList"
]
LAST EVENT DATA:
{
  "variables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "curr": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "297",
          "$type": "ListNode",
          "fields": {
            "val": 3,
            "next": null
          }
        }
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "arrayReferences": [],
  "postVariables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "curr": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "297",
          "$type": "ListNode",
          "fields": {
            "val": 3,
            "next": null
          }
        }
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "semanticRoles": [
    {
      "name": "curr",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "curr is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used in a condition",
        "derived from head, next",
        "used to compute next",
        "used to compute prev"
      ],
      "method": "reverseList"
    },
    {
      "name": "prev",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "prev is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used to compute next",
        "derived from curr",
        "contributes to the returned expression"
      ],
      "method": "reverseList"
    }
  ]
}

================================================================================

STEP 10 / 24
LINE: 16
CODE: while(curr != null){
EVENT: STEP
METHOD: reverseList
DEPTH: 1
CONDITION: TRUE
EXECUTION EVENTS:
[]
VARIABLES:
{
  "head": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "prev": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "curr": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "297",
        "$type": "ListNode",
        "fields": {
          "val": 3,
          "next": null
        }
      }
    }
  },
  "this": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
ARRAYS:
{}
DATA STRUCTURES:
{}
OBJECTS:
{
  "294": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "296": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "297",
        "$type": "ListNode",
        "fields": {
          "val": 3,
          "next": null
        }
      }
    }
  },
  "297": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": null
    }
  },
  "298": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
CALL STACK:
[
  "reverseList"
]
LAST EVENT DATA:
{
  "variables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "curr": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "297",
          "$type": "ListNode",
          "fields": {
            "val": 3,
            "next": null
          }
        }
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "arrayReferences": [],
  "conditionResult": true,
  "postVariables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "curr": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "297",
          "$type": "ListNode",
          "fields": {
            "val": 3,
            "next": null
          }
        }
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "semanticRoles": [
    {
      "name": "curr",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "curr is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used in a condition",
        "derived from head, next",
        "used to compute next",
        "used to compute prev"
      ],
      "method": "reverseList"
    },
    {
      "name": "prev",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "prev is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used to compute next",
        "derived from curr",
        "contributes to the returned expression"
      ],
      "method": "reverseList"
    }
  ]
}

================================================================================

STEP 11 / 24
LINE: 17
CODE: ListNode next = curr.next;
EVENT: STEP
METHOD: reverseList
DEPTH: 1
CONDITION: —
EXECUTION EVENTS:
[
  {
    "sequence": 0,
    "type": "VARIABLE_UPDATE",
    "line": 17,
    "method": "reverseList",
    "depth": 1,
    "data": {
      "name": "next",
      "value": {
        "$objectId": "297",
        "$type": "ListNode",
        "fields": {
          "val": 3,
          "next": null
        }
      }
    }
  }
]
VARIABLES:
{
  "head": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "prev": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "curr": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "297",
        "$type": "ListNode",
        "fields": {
          "val": 3,
          "next": null
        }
      }
    }
  },
  "next": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": null
    }
  },
  "this": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
ARRAYS:
{}
DATA STRUCTURES:
{}
OBJECTS:
{
  "294": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "296": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "297",
        "$type": "ListNode",
        "fields": {
          "val": 3,
          "next": null
        }
      }
    }
  },
  "297": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": null
    }
  },
  "298": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
CALL STACK:
[
  "reverseList"
]
LAST EVENT DATA:
{
  "variables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "curr": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "297",
          "$type": "ListNode",
          "fields": {
            "val": 3,
            "next": null
          }
        }
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "arrayReferences": [],
  "postVariables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "curr": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "297",
          "$type": "ListNode",
          "fields": {
            "val": 3,
            "next": null
          }
        }
      }
    },
    "next": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": null
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "executionEvents": [
    {
      "sequence": 0,
      "type": "VARIABLE_UPDATE",
      "line": 17,
      "method": "reverseList",
      "depth": 1,
      "data": {
        "name": "next",
        "value": {
          "$objectId": "297",
          "$type": "ListNode",
          "fields": {
            "val": 3,
            "next": null
          }
        }
      }
    }
  ],
  "semanticRoles": [
    {
      "name": "curr",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "curr is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used in a condition",
        "derived from head, next",
        "used to compute next",
        "used to compute prev"
      ],
      "method": "reverseList"
    },
    {
      "name": "prev",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "prev is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used to compute next",
        "derived from curr",
        "contributes to the returned expression"
      ],
      "method": "reverseList"
    }
  ]
}

================================================================================

STEP 12 / 24
LINE: 18
CODE: curr.next = prev;
EVENT: STEP
METHOD: reverseList
DEPTH: 1
CONDITION: —
EXECUTION EVENTS:
[
  {
    "sequence": 0,
    "type": "OBJECT_FIELD_WRITE",
    "line": 18,
    "method": "reverseList",
    "depth": 1,
    "data": {
      "name": "curr",
      "objectId": "296",
      "changes": [
        {
          "fields": [
            "next"
          ],
          "before": {
            "$objectId": "297",
            "$type": "ListNode",
            "fields": {
              "val": 3,
              "next": null
            }
          },
          "after": {
            "$objectId": "294",
            "$type": "ListNode",
            "fields": {
              "val": 1,
              "next": null
            }
          }
        }
      ],
      "value": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "294",
            "$type": "ListNode",
            "fields": {
              "val": 1,
              "next": null
            }
          }
        }
      }
    }
  }
]
VARIABLES:
{
  "head": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "prev": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "curr": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "294",
        "$type": "ListNode",
        "fields": {
          "val": 1,
          "next": null
        }
      }
    }
  },
  "next": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": null
    }
  },
  "this": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
ARRAYS:
{}
DATA STRUCTURES:
{}
OBJECTS:
{
  "294": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "296": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "294",
        "$type": "ListNode",
        "fields": {
          "val": 1,
          "next": null
        }
      }
    }
  },
  "297": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": null
    }
  },
  "298": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
CALL STACK:
[
  "reverseList"
]
LAST EVENT DATA:
{
  "variables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "curr": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "297",
          "$type": "ListNode",
          "fields": {
            "val": 3,
            "next": null
          }
        }
      }
    },
    "next": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": null
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "arrayReferences": [],
  "postVariables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "curr": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "294",
          "$type": "ListNode",
          "fields": {
            "val": 1,
            "next": null
          }
        }
      }
    },
    "next": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": null
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "executionEvents": [
    {
      "sequence": 0,
      "type": "OBJECT_FIELD_WRITE",
      "line": 18,
      "method": "reverseList",
      "depth": 1,
      "data": {
        "name": "curr",
        "objectId": "296",
        "changes": [
          {
            "fields": [
              "next"
            ],
            "before": {
              "$objectId": "297",
              "$type": "ListNode",
              "fields": {
                "val": 3,
                "next": null
              }
            },
            "after": {
              "$objectId": "294",
              "$type": "ListNode",
              "fields": {
                "val": 1,
                "next": null
              }
            }
          }
        ],
        "value": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "294",
              "$type": "ListNode",
              "fields": {
                "val": 1,
                "next": null
              }
            }
          }
        }
      }
    }
  ],
  "semanticRoles": [
    {
      "name": "curr",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "curr is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used in a condition",
        "derived from head, next",
        "used to compute next",
        "used to compute prev"
      ],
      "method": "reverseList"
    },
    {
      "name": "prev",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "prev is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used to compute next",
        "derived from curr",
        "contributes to the returned expression"
      ],
      "method": "reverseList"
    }
  ]
}

================================================================================

STEP 13 / 24
LINE: 19
CODE: prev = curr;
EVENT: STEP
METHOD: reverseList
DEPTH: 1
CONDITION: —
EXECUTION EVENTS:
[
  {
    "sequence": 0,
    "type": "VARIABLE_UPDATE",
    "line": 19,
    "method": "reverseList",
    "depth": 1,
    "data": {
      "name": "prev",
      "value": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "294",
            "$type": "ListNode",
            "fields": {
              "val": 1,
              "next": null
            }
          }
        }
      },
      "before": {
        "$objectId": "294",
        "$type": "ListNode",
        "fields": {
          "val": 1,
          "next": null
        }
      }
    }
  }
]
VARIABLES:
{
  "head": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "prev": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "294",
        "$type": "ListNode",
        "fields": {
          "val": 1,
          "next": null
        }
      }
    }
  },
  "curr": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "294",
        "$type": "ListNode",
        "fields": {
          "val": 1,
          "next": null
        }
      }
    }
  },
  "next": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": null
    }
  },
  "this": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
ARRAYS:
{}
DATA STRUCTURES:
{}
OBJECTS:
{
  "294": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "296": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "294",
        "$type": "ListNode",
        "fields": {
          "val": 1,
          "next": null
        }
      }
    }
  },
  "297": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": null
    }
  },
  "298": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
CALL STACK:
[
  "reverseList"
]
LAST EVENT DATA:
{
  "variables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "curr": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "294",
          "$type": "ListNode",
          "fields": {
            "val": 1,
            "next": null
          }
        }
      }
    },
    "next": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": null
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "arrayReferences": [],
  "postVariables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "294",
          "$type": "ListNode",
          "fields": {
            "val": 1,
            "next": null
          }
        }
      }
    },
    "curr": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "294",
          "$type": "ListNode",
          "fields": {
            "val": 1,
            "next": null
          }
        }
      }
    },
    "next": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": null
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "executionEvents": [
    {
      "sequence": 0,
      "type": "VARIABLE_UPDATE",
      "line": 19,
      "method": "reverseList",
      "depth": 1,
      "data": {
        "name": "prev",
        "value": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "294",
              "$type": "ListNode",
              "fields": {
                "val": 1,
                "next": null
              }
            }
          }
        },
        "before": {
          "$objectId": "294",
          "$type": "ListNode",
          "fields": {
            "val": 1,
            "next": null
          }
        }
      }
    }
  ],
  "semanticRoles": [
    {
      "name": "curr",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "curr is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used in a condition",
        "derived from head, next",
        "used to compute next",
        "used to compute prev"
      ],
      "method": "reverseList"
    },
    {
      "name": "prev",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "prev is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used to compute next",
        "derived from curr",
        "contributes to the returned expression"
      ],
      "method": "reverseList"
    }
  ]
}

================================================================================

STEP 14 / 24
LINE: 20
CODE: curr = next;
EVENT: STEP
METHOD: reverseList
DEPTH: 1
CONDITION: —
EXECUTION EVENTS:
[
  {
    "sequence": 0,
    "type": "VARIABLE_UPDATE",
    "line": 20,
    "method": "reverseList",
    "depth": 1,
    "data": {
      "name": "curr",
      "value": {
        "$objectId": "297",
        "$type": "ListNode",
        "fields": {
          "val": 3,
          "next": null
        }
      },
      "before": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "294",
            "$type": "ListNode",
            "fields": {
              "val": 1,
              "next": null
            }
          }
        }
      }
    }
  }
]
VARIABLES:
{
  "head": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "prev": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "294",
        "$type": "ListNode",
        "fields": {
          "val": 1,
          "next": null
        }
      }
    }
  },
  "curr": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": null
    }
  },
  "this": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
ARRAYS:
{}
DATA STRUCTURES:
{}
OBJECTS:
{
  "294": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "296": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "294",
        "$type": "ListNode",
        "fields": {
          "val": 1,
          "next": null
        }
      }
    }
  },
  "297": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": null
    }
  },
  "298": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
CALL STACK:
[
  "reverseList"
]
LAST EVENT DATA:
{
  "variables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "294",
          "$type": "ListNode",
          "fields": {
            "val": 1,
            "next": null
          }
        }
      }
    },
    "curr": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "294",
          "$type": "ListNode",
          "fields": {
            "val": 1,
            "next": null
          }
        }
      }
    },
    "next": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": null
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "arrayReferences": [],
  "postVariables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "294",
          "$type": "ListNode",
          "fields": {
            "val": 1,
            "next": null
          }
        }
      }
    },
    "curr": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": null
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "executionEvents": [
    {
      "sequence": 0,
      "type": "VARIABLE_UPDATE",
      "line": 20,
      "method": "reverseList",
      "depth": 1,
      "data": {
        "name": "curr",
        "value": {
          "$objectId": "297",
          "$type": "ListNode",
          "fields": {
            "val": 3,
            "next": null
          }
        },
        "before": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "294",
              "$type": "ListNode",
              "fields": {
                "val": 1,
                "next": null
              }
            }
          }
        }
      }
    }
  ],
  "semanticRoles": [
    {
      "name": "curr",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "curr is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used in a condition",
        "derived from head, next",
        "used to compute next",
        "used to compute prev"
      ],
      "method": "reverseList"
    },
    {
      "name": "prev",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "prev is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used to compute next",
        "derived from curr",
        "contributes to the returned expression"
      ],
      "method": "reverseList"
    }
  ]
}

================================================================================

STEP 15 / 24
LINE: 21
CODE: }
EVENT: STEP
METHOD: reverseList
DEPTH: 1
CONDITION: —
EXECUTION EVENTS:
[]
VARIABLES:
{
  "head": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "prev": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "294",
        "$type": "ListNode",
        "fields": {
          "val": 1,
          "next": null
        }
      }
    }
  },
  "curr": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": null
    }
  },
  "this": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
ARRAYS:
{}
DATA STRUCTURES:
{}
OBJECTS:
{
  "294": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "296": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "294",
        "$type": "ListNode",
        "fields": {
          "val": 1,
          "next": null
        }
      }
    }
  },
  "297": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": null
    }
  },
  "298": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
CALL STACK:
[
  "reverseList"
]
LAST EVENT DATA:
{
  "variables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "294",
          "$type": "ListNode",
          "fields": {
            "val": 1,
            "next": null
          }
        }
      }
    },
    "curr": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": null
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "arrayReferences": [],
  "postVariables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "294",
          "$type": "ListNode",
          "fields": {
            "val": 1,
            "next": null
          }
        }
      }
    },
    "curr": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": null
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "semanticRoles": [
    {
      "name": "curr",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "curr is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used in a condition",
        "derived from head, next",
        "used to compute next",
        "used to compute prev"
      ],
      "method": "reverseList"
    },
    {
      "name": "prev",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "prev is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used to compute next",
        "derived from curr",
        "contributes to the returned expression"
      ],
      "method": "reverseList"
    }
  ]
}

================================================================================

STEP 16 / 24
LINE: 16
CODE: while(curr != null){
EVENT: STEP
METHOD: reverseList
DEPTH: 1
CONDITION: TRUE
EXECUTION EVENTS:
[]
VARIABLES:
{
  "head": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "prev": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "294",
        "$type": "ListNode",
        "fields": {
          "val": 1,
          "next": null
        }
      }
    }
  },
  "curr": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": null
    }
  },
  "this": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
ARRAYS:
{}
DATA STRUCTURES:
{}
OBJECTS:
{
  "294": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "296": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "294",
        "$type": "ListNode",
        "fields": {
          "val": 1,
          "next": null
        }
      }
    }
  },
  "297": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": null
    }
  },
  "298": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
CALL STACK:
[
  "reverseList"
]
LAST EVENT DATA:
{
  "variables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "294",
          "$type": "ListNode",
          "fields": {
            "val": 1,
            "next": null
          }
        }
      }
    },
    "curr": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": null
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "arrayReferences": [],
  "conditionResult": true,
  "postVariables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "294",
          "$type": "ListNode",
          "fields": {
            "val": 1,
            "next": null
          }
        }
      }
    },
    "curr": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": null
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "semanticRoles": [
    {
      "name": "curr",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "curr is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used in a condition",
        "derived from head, next",
        "used to compute next",
        "used to compute prev"
      ],
      "method": "reverseList"
    },
    {
      "name": "prev",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "prev is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used to compute next",
        "derived from curr",
        "contributes to the returned expression"
      ],
      "method": "reverseList"
    }
  ]
}

================================================================================

STEP 17 / 24
LINE: 17
CODE: ListNode next = curr.next;
EVENT: STEP
METHOD: reverseList
DEPTH: 1
CONDITION: —
EXECUTION EVENTS:
[
  {
    "sequence": 0,
    "type": "VARIABLE_UPDATE",
    "line": 17,
    "method": "reverseList",
    "depth": 1,
    "data": {
      "name": "next",
      "value": null
    }
  }
]
VARIABLES:
{
  "head": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "prev": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "294",
        "$type": "ListNode",
        "fields": {
          "val": 1,
          "next": null
        }
      }
    }
  },
  "curr": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": null
    }
  },
  "next": null,
  "this": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
ARRAYS:
{}
DATA STRUCTURES:
{}
OBJECTS:
{
  "294": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "296": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "294",
        "$type": "ListNode",
        "fields": {
          "val": 1,
          "next": null
        }
      }
    }
  },
  "297": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": null
    }
  },
  "298": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
CALL STACK:
[
  "reverseList"
]
LAST EVENT DATA:
{
  "variables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "294",
          "$type": "ListNode",
          "fields": {
            "val": 1,
            "next": null
          }
        }
      }
    },
    "curr": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": null
      }
    },
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "arrayReferences": [],
  "postVariables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "294",
          "$type": "ListNode",
          "fields": {
            "val": 1,
            "next": null
          }
        }
      }
    },
    "curr": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": null
      }
    },
    "next": null,
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "executionEvents": [
    {
      "sequence": 0,
      "type": "VARIABLE_UPDATE",
      "line": 17,
      "method": "reverseList",
      "depth": 1,
      "data": {
        "name": "next",
        "value": null
      }
    }
  ],
  "semanticRoles": [
    {
      "name": "curr",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "curr is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used in a condition",
        "derived from head, next",
        "used to compute next",
        "used to compute prev"
      ],
      "method": "reverseList"
    },
    {
      "name": "prev",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "prev is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used to compute next",
        "derived from curr",
        "contributes to the returned expression"
      ],
      "method": "reverseList"
    }
  ]
}

================================================================================

STEP 18 / 24
LINE: 18
CODE: curr.next = prev;
EVENT: STEP
METHOD: reverseList
DEPTH: 1
CONDITION: —
EXECUTION EVENTS:
[
  {
    "sequence": 0,
    "type": "OBJECT_FIELD_WRITE",
    "line": 18,
    "method": "reverseList",
    "depth": 1,
    "data": {
      "name": "curr",
      "objectId": "297",
      "changes": [
        {
          "fields": [
            "next"
          ],
          "before": null,
          "after": {
            "$objectId": "296",
            "$type": "ListNode",
            "fields": {
              "val": 2,
              "next": {
                "$objectId": "294",
                "$type": "ListNode",
                "fields": {
                  "val": 1,
                  "next": null
                }
              }
            }
          }
        }
      ],
      "value": {
        "$objectId": "297",
        "$type": "ListNode",
        "fields": {
          "val": 3,
          "next": {
            "$objectId": "296",
            "$type": "ListNode",
            "fields": {
              "val": 2,
              "next": {
                "$objectId": "294",
                "$type": "ListNode",
                "fields": {
                  "val": 1,
                  "next": null
                }
              }
            }
          }
        }
      }
    }
  }
]
VARIABLES:
{
  "head": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "prev": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "294",
        "$type": "ListNode",
        "fields": {
          "val": 1,
          "next": null
        }
      }
    }
  },
  "curr": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "294",
            "$type": "ListNode",
            "fields": {
              "val": 1,
              "next": null
            }
          }
        }
      }
    }
  },
  "next": null,
  "this": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
ARRAYS:
{}
DATA STRUCTURES:
{}
OBJECTS:
{
  "294": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "296": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "294",
        "$type": "ListNode",
        "fields": {
          "val": 1,
          "next": null
        }
      }
    }
  },
  "297": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "294",
            "$type": "ListNode",
            "fields": {
              "val": 1,
              "next": null
            }
          }
        }
      }
    }
  },
  "298": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
CALL STACK:
[
  "reverseList"
]
LAST EVENT DATA:
{
  "variables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "294",
          "$type": "ListNode",
          "fields": {
            "val": 1,
            "next": null
          }
        }
      }
    },
    "curr": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": null
      }
    },
    "next": null,
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "arrayReferences": [],
  "postVariables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "294",
          "$type": "ListNode",
          "fields": {
            "val": 1,
            "next": null
          }
        }
      }
    },
    "curr": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "294",
              "$type": "ListNode",
              "fields": {
                "val": 1,
                "next": null
              }
            }
          }
        }
      }
    },
    "next": null,
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "executionEvents": [
    {
      "sequence": 0,
      "type": "OBJECT_FIELD_WRITE",
      "line": 18,
      "method": "reverseList",
      "depth": 1,
      "data": {
        "name": "curr",
        "objectId": "297",
        "changes": [
          {
            "fields": [
              "next"
            ],
            "before": null,
            "after": {
              "$objectId": "296",
              "$type": "ListNode",
              "fields": {
                "val": 2,
                "next": {
                  "$objectId": "294",
                  "$type": "ListNode",
                  "fields": {
                    "val": 1,
                    "next": null
                  }
                }
              }
            }
          }
        ],
        "value": {
          "$objectId": "297",
          "$type": "ListNode",
          "fields": {
            "val": 3,
            "next": {
              "$objectId": "296",
              "$type": "ListNode",
              "fields": {
                "val": 2,
                "next": {
                  "$objectId": "294",
                  "$type": "ListNode",
                  "fields": {
                    "val": 1,
                    "next": null
                  }
                }
              }
            }
          }
        }
      }
    }
  ],
  "semanticRoles": [
    {
      "name": "curr",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "curr is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used in a condition",
        "derived from head, next",
        "used to compute next",
        "used to compute prev"
      ],
      "method": "reverseList"
    },
    {
      "name": "prev",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "prev is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used to compute next",
        "derived from curr",
        "contributes to the returned expression"
      ],
      "method": "reverseList"
    }
  ]
}

================================================================================

STEP 19 / 24
LINE: 19
CODE: prev = curr;
EVENT: STEP
METHOD: reverseList
DEPTH: 1
CONDITION: —
EXECUTION EVENTS:
[
  {
    "sequence": 0,
    "type": "VARIABLE_UPDATE",
    "line": 19,
    "method": "reverseList",
    "depth": 1,
    "data": {
      "name": "prev",
      "value": {
        "$objectId": "297",
        "$type": "ListNode",
        "fields": {
          "val": 3,
          "next": {
            "$objectId": "296",
            "$type": "ListNode",
            "fields": {
              "val": 2,
              "next": {
                "$objectId": "294",
                "$type": "ListNode",
                "fields": {
                  "val": 1,
                  "next": null
                }
              }
            }
          }
        }
      },
      "before": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "294",
            "$type": "ListNode",
            "fields": {
              "val": 1,
              "next": null
            }
          }
        }
      }
    }
  }
]
VARIABLES:
{
  "head": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "prev": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "294",
            "$type": "ListNode",
            "fields": {
              "val": 1,
              "next": null
            }
          }
        }
      }
    }
  },
  "curr": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "294",
            "$type": "ListNode",
            "fields": {
              "val": 1,
              "next": null
            }
          }
        }
      }
    }
  },
  "next": null,
  "this": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
ARRAYS:
{}
DATA STRUCTURES:
{}
OBJECTS:
{
  "294": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "296": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "294",
        "$type": "ListNode",
        "fields": {
          "val": 1,
          "next": null
        }
      }
    }
  },
  "297": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "294",
            "$type": "ListNode",
            "fields": {
              "val": 1,
              "next": null
            }
          }
        }
      }
    }
  },
  "298": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
CALL STACK:
[
  "reverseList"
]
LAST EVENT DATA:
{
  "variables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "296",
      "$type": "ListNode",
      "fields": {
        "val": 2,
        "next": {
          "$objectId": "294",
          "$type": "ListNode",
          "fields": {
            "val": 1,
            "next": null
          }
        }
      }
    },
    "curr": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "294",
              "$type": "ListNode",
              "fields": {
                "val": 1,
                "next": null
              }
            }
          }
        }
      }
    },
    "next": null,
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "arrayReferences": [],
  "postVariables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "294",
              "$type": "ListNode",
              "fields": {
                "val": 1,
                "next": null
              }
            }
          }
        }
      }
    },
    "curr": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "294",
              "$type": "ListNode",
              "fields": {
                "val": 1,
                "next": null
              }
            }
          }
        }
      }
    },
    "next": null,
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "executionEvents": [
    {
      "sequence": 0,
      "type": "VARIABLE_UPDATE",
      "line": 19,
      "method": "reverseList",
      "depth": 1,
      "data": {
        "name": "prev",
        "value": {
          "$objectId": "297",
          "$type": "ListNode",
          "fields": {
            "val": 3,
            "next": {
              "$objectId": "296",
              "$type": "ListNode",
              "fields": {
                "val": 2,
                "next": {
                  "$objectId": "294",
                  "$type": "ListNode",
                  "fields": {
                    "val": 1,
                    "next": null
                  }
                }
              }
            }
          }
        },
        "before": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "294",
              "$type": "ListNode",
              "fields": {
                "val": 1,
                "next": null
              }
            }
          }
        }
      }
    }
  ],
  "semanticRoles": [
    {
      "name": "curr",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "curr is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used in a condition",
        "derived from head, next",
        "used to compute next",
        "used to compute prev"
      ],
      "method": "reverseList"
    },
    {
      "name": "prev",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "prev is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used to compute next",
        "derived from curr",
        "contributes to the returned expression"
      ],
      "method": "reverseList"
    }
  ]
}

================================================================================

STEP 20 / 24
LINE: 20
CODE: curr = next;
EVENT: STEP
METHOD: reverseList
DEPTH: 1
CONDITION: —
EXECUTION EVENTS:
[
  {
    "sequence": 0,
    "type": "VARIABLE_UPDATE",
    "line": 20,
    "method": "reverseList",
    "depth": 1,
    "data": {
      "name": "curr",
      "value": null,
      "before": {
        "$objectId": "297",
        "$type": "ListNode",
        "fields": {
          "val": 3,
          "next": {
            "$objectId": "296",
            "$type": "ListNode",
            "fields": {
              "val": 2,
              "next": {
                "$objectId": "294",
                "$type": "ListNode",
                "fields": {
                  "val": 1,
                  "next": null
                }
              }
            }
          }
        }
      }
    }
  }
]
VARIABLES:
{
  "head": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "prev": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "294",
            "$type": "ListNode",
            "fields": {
              "val": 1,
              "next": null
            }
          }
        }
      }
    }
  },
  "curr": null,
  "this": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
ARRAYS:
{}
DATA STRUCTURES:
{}
OBJECTS:
{
  "294": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "296": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "294",
        "$type": "ListNode",
        "fields": {
          "val": 1,
          "next": null
        }
      }
    }
  },
  "297": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "294",
            "$type": "ListNode",
            "fields": {
              "val": 1,
              "next": null
            }
          }
        }
      }
    }
  },
  "298": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
CALL STACK:
[
  "reverseList"
]
LAST EVENT DATA:
{
  "variables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "294",
              "$type": "ListNode",
              "fields": {
                "val": 1,
                "next": null
              }
            }
          }
        }
      }
    },
    "curr": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "294",
              "$type": "ListNode",
              "fields": {
                "val": 1,
                "next": null
              }
            }
          }
        }
      }
    },
    "next": null,
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "arrayReferences": [],
  "postVariables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "294",
              "$type": "ListNode",
              "fields": {
                "val": 1,
                "next": null
              }
            }
          }
        }
      }
    },
    "curr": null,
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "executionEvents": [
    {
      "sequence": 0,
      "type": "VARIABLE_UPDATE",
      "line": 20,
      "method": "reverseList",
      "depth": 1,
      "data": {
        "name": "curr",
        "value": null,
        "before": {
          "$objectId": "297",
          "$type": "ListNode",
          "fields": {
            "val": 3,
            "next": {
              "$objectId": "296",
              "$type": "ListNode",
              "fields": {
                "val": 2,
                "next": {
                  "$objectId": "294",
                  "$type": "ListNode",
                  "fields": {
                    "val": 1,
                    "next": null
                  }
                }
              }
            }
          }
        }
      }
    }
  ],
  "semanticRoles": [
    {
      "name": "curr",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "curr is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used in a condition",
        "derived from head, next",
        "used to compute next",
        "used to compute prev"
      ],
      "method": "reverseList"
    },
    {
      "name": "prev",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "prev is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used to compute next",
        "derived from curr",
        "contributes to the returned expression"
      ],
      "method": "reverseList"
    }
  ]
}

================================================================================

STEP 21 / 24
LINE: 21
CODE: }
EVENT: STEP
METHOD: reverseList
DEPTH: 1
CONDITION: —
EXECUTION EVENTS:
[]
VARIABLES:
{
  "head": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "prev": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "294",
            "$type": "ListNode",
            "fields": {
              "val": 1,
              "next": null
            }
          }
        }
      }
    }
  },
  "curr": null,
  "this": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
ARRAYS:
{}
DATA STRUCTURES:
{}
OBJECTS:
{
  "294": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "296": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "294",
        "$type": "ListNode",
        "fields": {
          "val": 1,
          "next": null
        }
      }
    }
  },
  "297": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "294",
            "$type": "ListNode",
            "fields": {
              "val": 1,
              "next": null
            }
          }
        }
      }
    }
  },
  "298": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
CALL STACK:
[
  "reverseList"
]
LAST EVENT DATA:
{
  "variables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "294",
              "$type": "ListNode",
              "fields": {
                "val": 1,
                "next": null
              }
            }
          }
        }
      }
    },
    "curr": null,
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "arrayReferences": [],
  "postVariables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "294",
              "$type": "ListNode",
              "fields": {
                "val": 1,
                "next": null
              }
            }
          }
        }
      }
    },
    "curr": null,
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "semanticRoles": [
    {
      "name": "curr",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "curr is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used in a condition",
        "derived from head, next",
        "used to compute next",
        "used to compute prev"
      ],
      "method": "reverseList"
    },
    {
      "name": "prev",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "prev is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used to compute next",
        "derived from curr",
        "contributes to the returned expression"
      ],
      "method": "reverseList"
    }
  ]
}

================================================================================

STEP 22 / 24
LINE: 16
CODE: while(curr != null){
EVENT: STEP
METHOD: reverseList
DEPTH: 1
CONDITION: FALSE
EXECUTION EVENTS:
[]
VARIABLES:
{
  "head": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "prev": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "294",
            "$type": "ListNode",
            "fields": {
              "val": 1,
              "next": null
            }
          }
        }
      }
    }
  },
  "curr": null,
  "this": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
ARRAYS:
{}
DATA STRUCTURES:
{}
OBJECTS:
{
  "294": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "296": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "294",
        "$type": "ListNode",
        "fields": {
          "val": 1,
          "next": null
        }
      }
    }
  },
  "297": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "294",
            "$type": "ListNode",
            "fields": {
              "val": 1,
              "next": null
            }
          }
        }
      }
    }
  },
  "298": {
    "$objectId": "298",
    "$type": "Solution",
    "fields": {}
  }
}
CALL STACK:
[
  "reverseList"
]
LAST EVENT DATA:
{
  "variables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "294",
              "$type": "ListNode",
              "fields": {
                "val": 1,
                "next": null
              }
            }
          }
        }
      }
    },
    "curr": null,
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "arrayReferences": [],
  "conditionResult": false,
  "postVariables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "294",
              "$type": "ListNode",
              "fields": {
                "val": 1,
                "next": null
              }
            }
          }
        }
      }
    },
    "curr": null,
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "semanticRoles": [
    {
      "name": "curr",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "curr is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used in a condition",
        "derived from head, next",
        "used to compute next",
        "used to compute prev"
      ],
      "method": "reverseList"
    },
    {
      "name": "prev",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "prev is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used to compute next",
        "derived from curr",
        "contributes to the returned expression"
      ],
      "method": "reverseList"
    }
  ]
}

================================================================================

STEP 23 / 24
LINE: 22
CODE: return prev;
EVENT: STEP
METHOD: reverseList
DEPTH: 1
CONDITION: —
EXECUTION EVENTS:
[]
VARIABLES:
{
  "head": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "prev": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "294",
            "$type": "ListNode",
            "fields": {
              "val": 1,
              "next": null
            }
          }
        }
      }
    }
  },
  "curr": null
}
ARRAYS:
{}
DATA STRUCTURES:
{}
OBJECTS:
{
  "294": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "296": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "294",
        "$type": "ListNode",
        "fields": {
          "val": 1,
          "next": null
        }
      }
    }
  },
  "297": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "294",
            "$type": "ListNode",
            "fields": {
              "val": 1,
              "next": null
            }
          }
        }
      }
    }
  }
}
CALL STACK:
[
  "reverseList"
]
LAST EVENT DATA:
{
  "variables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "294",
              "$type": "ListNode",
              "fields": {
                "val": 1,
                "next": null
              }
            }
          }
        }
      }
    },
    "curr": null,
    "this": {
      "$objectId": "298",
      "$type": "Solution",
      "fields": {}
    }
  },
  "arrayReferences": [],
  "postVariables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "294",
              "$type": "ListNode",
              "fields": {
                "val": 1,
                "next": null
              }
            }
          }
        }
      }
    },
    "curr": null
  },
  "returnValue": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "294",
            "$type": "ListNode",
            "fields": {
              "val": 1,
              "next": null
            }
          }
        }
      }
    }
  },
  "semanticRoles": [
    {
      "name": "curr",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "curr is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used in a condition",
        "derived from head, next",
        "used to compute next",
        "used to compute prev"
      ],
      "method": "reverseList"
    },
    {
      "name": "prev",
      "role": "pointer",
      "confidence": 0.76,
      "evidence": "prev is updated in a loop and matches a pointer-role convention",
      "usage": [
        "used to compute next",
        "derived from curr",
        "contributes to the returned expression"
      ],
      "method": "reverseList"
    }
  ]
}

================================================================================

STEP 24 / 24
LINE: 22
CODE: return prev;
EVENT: METHOD_EXIT
METHOD: reverseList
DEPTH: 1
CONDITION: —
EXECUTION EVENTS:
[]
VARIABLES:
{
  "head": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "prev": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "294",
            "$type": "ListNode",
            "fields": {
              "val": 1,
              "next": null
            }
          }
        }
      }
    }
  },
  "curr": null
}
ARRAYS:
{}
DATA STRUCTURES:
{}
OBJECTS:
{
  "294": {
    "$objectId": "294",
    "$type": "ListNode",
    "fields": {
      "val": 1,
      "next": null
    }
  },
  "296": {
    "$objectId": "296",
    "$type": "ListNode",
    "fields": {
      "val": 2,
      "next": {
        "$objectId": "294",
        "$type": "ListNode",
        "fields": {
          "val": 1,
          "next": null
        }
      }
    }
  },
  "297": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "294",
            "$type": "ListNode",
            "fields": {
              "val": 1,
              "next": null
            }
          }
        }
      }
    }
  }
}
CALL STACK:
[]
LAST EVENT DATA:
{
  "returnValue": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": {
        "$objectId": "296",
        "$type": "ListNode",
        "fields": {
          "val": 2,
          "next": {
            "$objectId": "294",
            "$type": "ListNode",
            "fields": {
              "val": 1,
              "next": null
            }
          }
        }
      }
    }
  },
  "variables": {
    "head": {
      "$objectId": "294",
      "$type": "ListNode",
      "fields": {
        "val": 1,
        "next": null
      }
    },
    "prev": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": {
          "$objectId": "296",
          "$type": "ListNode",
          "fields": {
            "val": 2,
            "next": {
              "$objectId": "294",
              "$type": "ListNode",
              "fields": {
                "val": 1,
                "next": null
              }
            }
          }
        }
      }
    },
    "curr": null
  }
}

================================================================================
