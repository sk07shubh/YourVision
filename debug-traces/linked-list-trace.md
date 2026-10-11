STEP 1 / 36
EXECUTED LINE 12: public ListNode reverseList(ListNode head) {
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
head: {
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
            "next": {
              "$objectId": "298",
              "$type": "ListNode",
              "fields": {
                "val": 4,
                "next": {
                  "$objectId": "299",
                  "$type": "ListNode",
                  "fields": {
                    "val": 5,
                    "next": null
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
TRACE EVENTS:
—

------------------------------------------------------------------------
STEP 2 / 36
EXECUTED LINE 13: ListNode prev = null;
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
prev: null
TRACE EVENTS:
VARIABLE_UPDATE: {
  "name": "prev",
  "value": null
}

------------------------------------------------------------------------
STEP 3 / 36
EXECUTED LINE 14: ListNode curr = head;
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
curr: {
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
            "next": {
              "$objectId": "298",
              "$type": "ListNode",
              "fields": {
                "val": 4,
                "next": {
                  "$objectId": "299",
                  "$type": "ListNode",
                  "fields": {
                    "val": 5,
                    "next": null
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
TRACE EVENTS:
VARIABLE_UPDATE: {
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
              "next": {
                "$objectId": "298",
                "$type": "ListNode",
                "fields": {
                  "val": 4,
                  "next": {
                    "$objectId": "299",
                    "$type": "ListNode",
                    "fields": {
                      "val": 5,
                      "next": null
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

------------------------------------------------------------------------
STEP 4 / 36
EXECUTED LINE 16: while(curr != null){
CONDITION RESULT: TRUE
VARIABLE / STATE CHANGES:
—
TRACE EVENTS:
—

------------------------------------------------------------------------
STEP 5 / 36
EXECUTED LINE 17: ListNode next = curr.next;
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
next: {
  "$objectId": "296",
  "$type": "ListNode",
  "fields": {
    "val": 2,
    "next": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": {
          "$objectId": "298",
          "$type": "ListNode",
          "fields": {
            "val": 4,
            "next": {
              "$objectId": "299",
              "$type": "ListNode",
              "fields": {
                "val": 5,
                "next": null
              }
            }
          }
        }
      }
    }
  }
}
TRACE EVENTS:
VARIABLE_UPDATE: {
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
          "next": {
            "$objectId": "298",
            "$type": "ListNode",
            "fields": {
              "val": 4,
              "next": {
                "$objectId": "299",
                "$type": "ListNode",
                "fields": {
                  "val": 5,
                  "next": null
                }
              }
            }
          }
        }
      }
    }
  }
}

------------------------------------------------------------------------
STEP 6 / 36
EXECUTED LINE 18: curr.next = prev;
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
head: {
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
            "next": {
              "$objectId": "298",
              "$type": "ListNode",
              "fields": {
                "val": 4,
                "next": {
                  "$objectId": "299",
                  "$type": "ListNode",
                  "fields": {
                    "val": 5,
                    "next": null
                  }
                }
              }
            }
          }
        }
      }
    }
  }
} → {
  "$objectId": "294",
  "$type": "ListNode",
  "fields": {
    "val": 1,
    "next": null
  }
}
curr: {
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
            "next": {
              "$objectId": "298",
              "$type": "ListNode",
              "fields": {
                "val": 4,
                "next": {
                  "$objectId": "299",
                  "$type": "ListNode",
                  "fields": {
                    "val": 5,
                    "next": null
                  }
                }
              }
            }
          }
        }
      }
    }
  }
} → {
  "$objectId": "294",
  "$type": "ListNode",
  "fields": {
    "val": 1,
    "next": null
  }
}
TRACE EVENTS:
OBJECT_FIELD_WRITE: {
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
              "next": {
                "$objectId": "298",
                "$type": "ListNode",
                "fields": {
                  "val": 4,
                  "next": {
                    "$objectId": "299",
                    "$type": "ListNode",
                    "fields": {
                      "val": 5,
                      "next": null
                    }
                  }
                }
              }
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

------------------------------------------------------------------------
STEP 7 / 36
EXECUTED LINE 19: prev = curr;
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
prev: null → {
  "$objectId": "294",
  "$type": "ListNode",
  "fields": {
    "val": 1,
    "next": null
  }
}
TRACE EVENTS:
VARIABLE_UPDATE: {
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

------------------------------------------------------------------------
STEP 8 / 36
EXECUTED LINE 20: curr = next;
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
curr: {
  "$objectId": "294",
  "$type": "ListNode",
  "fields": {
    "val": 1,
    "next": null
  }
} → {
  "$objectId": "296",
  "$type": "ListNode",
  "fields": {
    "val": 2,
    "next": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": {
          "$objectId": "298",
          "$type": "ListNode",
          "fields": {
            "val": 4,
            "next": {
              "$objectId": "299",
              "$type": "ListNode",
              "fields": {
                "val": 5,
                "next": null
              }
            }
          }
        }
      }
    }
  }
}
TRACE EVENTS:
VARIABLE_UPDATE: {
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
          "next": {
            "$objectId": "298",
            "$type": "ListNode",
            "fields": {
              "val": 4,
              "next": {
                "$objectId": "299",
                "$type": "ListNode",
                "fields": {
                  "val": 5,
                  "next": null
                }
              }
            }
          }
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

------------------------------------------------------------------------
STEP 9 / 36
EXECUTED LINE 21: }
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
—
TRACE EVENTS:
—

------------------------------------------------------------------------
STEP 10 / 36
EXECUTED LINE 16: while(curr != null){
CONDITION RESULT: TRUE
VARIABLE / STATE CHANGES:
—
TRACE EVENTS:
—

------------------------------------------------------------------------
STEP 11 / 36
EXECUTED LINE 17: ListNode next = curr.next;
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
next: {
  "$objectId": "297",
  "$type": "ListNode",
  "fields": {
    "val": 3,
    "next": {
      "$objectId": "298",
      "$type": "ListNode",
      "fields": {
        "val": 4,
        "next": {
          "$objectId": "299",
          "$type": "ListNode",
          "fields": {
            "val": 5,
            "next": null
          }
        }
      }
    }
  }
}
TRACE EVENTS:
VARIABLE_UPDATE: {
  "name": "next",
  "value": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": {
        "$objectId": "298",
        "$type": "ListNode",
        "fields": {
          "val": 4,
          "next": {
            "$objectId": "299",
            "$type": "ListNode",
            "fields": {
              "val": 5,
              "next": null
            }
          }
        }
      }
    }
  }
}

------------------------------------------------------------------------
STEP 12 / 36
EXECUTED LINE 18: curr.next = prev;
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
curr: {
  "$objectId": "296",
  "$type": "ListNode",
  "fields": {
    "val": 2,
    "next": {
      "$objectId": "297",
      "$type": "ListNode",
      "fields": {
        "val": 3,
        "next": {
          "$objectId": "298",
          "$type": "ListNode",
          "fields": {
            "val": 4,
            "next": {
              "$objectId": "299",
              "$type": "ListNode",
              "fields": {
                "val": 5,
                "next": null
              }
            }
          }
        }
      }
    }
  }
} → {
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
TRACE EVENTS:
OBJECT_FIELD_WRITE: {
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
          "next": {
            "$objectId": "298",
            "$type": "ListNode",
            "fields": {
              "val": 4,
              "next": {
                "$objectId": "299",
                "$type": "ListNode",
                "fields": {
                  "val": 5,
                  "next": null
                }
              }
            }
          }
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

------------------------------------------------------------------------
STEP 13 / 36
EXECUTED LINE 19: prev = curr;
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
prev: {
  "$objectId": "294",
  "$type": "ListNode",
  "fields": {
    "val": 1,
    "next": null
  }
} → {
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
TRACE EVENTS:
VARIABLE_UPDATE: {
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

------------------------------------------------------------------------
STEP 14 / 36
EXECUTED LINE 20: curr = next;
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
curr: {
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
} → {
  "$objectId": "297",
  "$type": "ListNode",
  "fields": {
    "val": 3,
    "next": {
      "$objectId": "298",
      "$type": "ListNode",
      "fields": {
        "val": 4,
        "next": {
          "$objectId": "299",
          "$type": "ListNode",
          "fields": {
            "val": 5,
            "next": null
          }
        }
      }
    }
  }
}
TRACE EVENTS:
VARIABLE_UPDATE: {
  "name": "curr",
  "value": {
    "$objectId": "297",
    "$type": "ListNode",
    "fields": {
      "val": 3,
      "next": {
        "$objectId": "298",
        "$type": "ListNode",
        "fields": {
          "val": 4,
          "next": {
            "$objectId": "299",
            "$type": "ListNode",
            "fields": {
              "val": 5,
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

------------------------------------------------------------------------
STEP 15 / 36
EXECUTED LINE 21: }
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
—
TRACE EVENTS:
—

------------------------------------------------------------------------
STEP 16 / 36
EXECUTED LINE 16: while(curr != null){
CONDITION RESULT: TRUE
VARIABLE / STATE CHANGES:
—
TRACE EVENTS:
—

------------------------------------------------------------------------
STEP 17 / 36
EXECUTED LINE 17: ListNode next = curr.next;
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
next: {
  "$objectId": "298",
  "$type": "ListNode",
  "fields": {
    "val": 4,
    "next": {
      "$objectId": "299",
      "$type": "ListNode",
      "fields": {
        "val": 5,
        "next": null
      }
    }
  }
}
TRACE EVENTS:
VARIABLE_UPDATE: {
  "name": "next",
  "value": {
    "$objectId": "298",
    "$type": "ListNode",
    "fields": {
      "val": 4,
      "next": {
        "$objectId": "299",
        "$type": "ListNode",
        "fields": {
          "val": 5,
          "next": null
        }
      }
    }
  }
}

------------------------------------------------------------------------
STEP 18 / 36
EXECUTED LINE 18: curr.next = prev;
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
curr: {
  "$objectId": "297",
  "$type": "ListNode",
  "fields": {
    "val": 3,
    "next": {
      "$objectId": "298",
      "$type": "ListNode",
      "fields": {
        "val": 4,
        "next": {
          "$objectId": "299",
          "$type": "ListNode",
          "fields": {
            "val": 5,
            "next": null
          }
        }
      }
    }
  }
} → {
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
TRACE EVENTS:
OBJECT_FIELD_WRITE: {
  "name": "curr",
  "objectId": "297",
  "changes": [
    {
      "fields": [
        "next"
      ],
      "before": {
        "$objectId": "298",
        "$type": "ListNode",
        "fields": {
          "val": 4,
          "next": {
            "$objectId": "299",
            "$type": "ListNode",
            "fields": {
              "val": 5,
              "next": null
            }
          }
        }
      },
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

------------------------------------------------------------------------
STEP 19 / 36
EXECUTED LINE 19: prev = curr;
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
prev: {
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
} → {
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
TRACE EVENTS:
VARIABLE_UPDATE: {
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

------------------------------------------------------------------------
STEP 20 / 36
EXECUTED LINE 20: curr = next;
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
curr: {
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
} → {
  "$objectId": "298",
  "$type": "ListNode",
  "fields": {
    "val": 4,
    "next": {
      "$objectId": "299",
      "$type": "ListNode",
      "fields": {
        "val": 5,
        "next": null
      }
    }
  }
}
TRACE EVENTS:
VARIABLE_UPDATE: {
  "name": "curr",
  "value": {
    "$objectId": "298",
    "$type": "ListNode",
    "fields": {
      "val": 4,
      "next": {
        "$objectId": "299",
        "$type": "ListNode",
        "fields": {
          "val": 5,
          "next": null
        }
      }
    }
  },
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

------------------------------------------------------------------------
STEP 21 / 36
EXECUTED LINE 21: }
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
—
TRACE EVENTS:
—

------------------------------------------------------------------------
STEP 22 / 36
EXECUTED LINE 16: while(curr != null){
CONDITION RESULT: TRUE
VARIABLE / STATE CHANGES:
—
TRACE EVENTS:
—

------------------------------------------------------------------------
STEP 23 / 36
EXECUTED LINE 17: ListNode next = curr.next;
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
next: {
  "$objectId": "299",
  "$type": "ListNode",
  "fields": {
    "val": 5,
    "next": null
  }
}
TRACE EVENTS:
VARIABLE_UPDATE: {
  "name": "next",
  "value": {
    "$objectId": "299",
    "$type": "ListNode",
    "fields": {
      "val": 5,
      "next": null
    }
  }
}

------------------------------------------------------------------------
STEP 24 / 36
EXECUTED LINE 18: curr.next = prev;
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
curr: {
  "$objectId": "298",
  "$type": "ListNode",
  "fields": {
    "val": 4,
    "next": {
      "$objectId": "299",
      "$type": "ListNode",
      "fields": {
        "val": 5,
        "next": null
      }
    }
  }
} → {
  "$objectId": "298",
  "$type": "ListNode",
  "fields": {
    "val": 4,
    "next": {
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
TRACE EVENTS:
OBJECT_FIELD_WRITE: {
  "name": "curr",
  "objectId": "298",
  "changes": [
    {
      "fields": [
        "next"
      ],
      "before": {
        "$objectId": "299",
        "$type": "ListNode",
        "fields": {
          "val": 5,
          "next": null
        }
      },
      "after": {
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
  ],
  "value": {
    "$objectId": "298",
    "$type": "ListNode",
    "fields": {
      "val": 4,
      "next": {
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
}

------------------------------------------------------------------------
STEP 25 / 36
EXECUTED LINE 19: prev = curr;
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
prev: {
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
} → {
  "$objectId": "298",
  "$type": "ListNode",
  "fields": {
    "val": 4,
    "next": {
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
TRACE EVENTS:
VARIABLE_UPDATE: {
  "name": "prev",
  "value": {
    "$objectId": "298",
    "$type": "ListNode",
    "fields": {
      "val": 4,
      "next": {
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
  },
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

------------------------------------------------------------------------
STEP 26 / 36
EXECUTED LINE 20: curr = next;
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
curr: {
  "$objectId": "298",
  "$type": "ListNode",
  "fields": {
    "val": 4,
    "next": {
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
} → {
  "$objectId": "299",
  "$type": "ListNode",
  "fields": {
    "val": 5,
    "next": null
  }
}
TRACE EVENTS:
VARIABLE_UPDATE: {
  "name": "curr",
  "value": {
    "$objectId": "299",
    "$type": "ListNode",
    "fields": {
      "val": 5,
      "next": null
    }
  },
  "before": {
    "$objectId": "298",
    "$type": "ListNode",
    "fields": {
      "val": 4,
      "next": {
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
}

------------------------------------------------------------------------
STEP 27 / 36
EXECUTED LINE 21: }
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
—
TRACE EVENTS:
—

------------------------------------------------------------------------
STEP 28 / 36
EXECUTED LINE 16: while(curr != null){
CONDITION RESULT: TRUE
VARIABLE / STATE CHANGES:
—
TRACE EVENTS:
—

------------------------------------------------------------------------
STEP 29 / 36
EXECUTED LINE 17: ListNode next = curr.next;
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
next: null
TRACE EVENTS:
VARIABLE_UPDATE: {
  "name": "next",
  "value": null
}

------------------------------------------------------------------------
STEP 30 / 36
EXECUTED LINE 18: curr.next = prev;
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
curr: {
  "$objectId": "299",
  "$type": "ListNode",
  "fields": {
    "val": 5,
    "next": null
  }
} → {
  "$objectId": "299",
  "$type": "ListNode",
  "fields": {
    "val": 5,
    "next": {
      "$objectId": "298",
      "$type": "ListNode",
      "fields": {
        "val": 4,
        "next": {
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
  }
}
TRACE EVENTS:
OBJECT_FIELD_WRITE: {
  "name": "curr",
  "objectId": "299",
  "changes": [
    {
      "fields": [
        "next"
      ],
      "before": null,
      "after": {
        "$objectId": "298",
        "$type": "ListNode",
        "fields": {
          "val": 4,
          "next": {
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
    }
  ],
  "value": {
    "$objectId": "299",
    "$type": "ListNode",
    "fields": {
      "val": 5,
      "next": {
        "$objectId": "298",
        "$type": "ListNode",
        "fields": {
          "val": 4,
          "next": {
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
    }
  }
}

------------------------------------------------------------------------
STEP 31 / 36
EXECUTED LINE 19: prev = curr;
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
prev: {
  "$objectId": "298",
  "$type": "ListNode",
  "fields": {
    "val": 4,
    "next": {
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
} → {
  "$objectId": "299",
  "$type": "ListNode",
  "fields": {
    "val": 5,
    "next": {
      "$objectId": "298",
      "$type": "ListNode",
      "fields": {
        "val": 4,
        "next": {
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
  }
}
TRACE EVENTS:
VARIABLE_UPDATE: {
  "name": "prev",
  "value": {
    "$objectId": "299",
    "$type": "ListNode",
    "fields": {
      "val": 5,
      "next": {
        "$objectId": "298",
        "$type": "ListNode",
        "fields": {
          "val": 4,
          "next": {
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
    }
  },
  "before": {
    "$objectId": "298",
    "$type": "ListNode",
    "fields": {
      "val": 4,
      "next": {
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
}

------------------------------------------------------------------------
STEP 32 / 36
EXECUTED LINE 20: curr = next;
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
curr: {
  "$objectId": "299",
  "$type": "ListNode",
  "fields": {
    "val": 5,
    "next": {
      "$objectId": "298",
      "$type": "ListNode",
      "fields": {
        "val": 4,
        "next": {
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
  }
} → null
TRACE EVENTS:
VARIABLE_UPDATE: {
  "name": "curr",
  "value": null,
  "before": {
    "$objectId": "299",
    "$type": "ListNode",
    "fields": {
      "val": 5,
      "next": {
        "$objectId": "298",
        "$type": "ListNode",
        "fields": {
          "val": 4,
          "next": {
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
    }
  }
}

------------------------------------------------------------------------
STEP 33 / 36
EXECUTED LINE 21: }
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
—
TRACE EVENTS:
—

------------------------------------------------------------------------
STEP 34 / 36
EXECUTED LINE 16: while(curr != null){
CONDITION RESULT: FALSE
VARIABLE / STATE CHANGES:
—
TRACE EVENTS:
—

------------------------------------------------------------------------
STEP 35 / 36
EXECUTED LINE 22: return prev;
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
—
TRACE EVENTS:
—

------------------------------------------------------------------------
STEP 36 / 36
EXECUTED LINE 22: return prev;
CONDITION RESULT: —
VARIABLE / STATE CHANGES:
—
TRACE EVENTS:
—
