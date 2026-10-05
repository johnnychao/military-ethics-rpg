/* 原創小隊回合戰：只含虛構演訓與教材摘要，不包含個人資料。 */
(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory();else root.TacticalMissions=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const CONTENT_VERSION='tactical-2026-10-06-v1';
const missions=[
  {
    "id": "u01",
    "number": 1,
    "chapterTitle": "行動準則的起點",
    "topic": "武德源流",
    "concepts": [
      {
        "term": "將德",
        "text": "兵家討論統率者的才德與紀律，不只是勝負與權謀。"
      },
      {
        "term": "仁政與人和",
        "text": "儒家關注人民生活與民心；當代服務類比仍須適用今日制度。"
      },
      {
        "term": "歷史脈絡",
        "text": "古代思想可支持提問，不能直接當成今日法律。"
      }
    ],
    "sourceRefs": [
      {
        "file": "教材/第2章/2-1.pdf",
        "pages": [
          1,
          2,
          3,
          5,
          7,
          9
        ],
        "label": "武德源流、兵家與儒家"
      }
    ],
    "learningObjective": "分辨兵家與儒家的歷史關切，把節制、將德與人和轉成服務站安排。",
    "ethicalContext": "出發前，小隊收到兩份古代思想摘要與一張需求圖。歷史展要變成今日救援服務的行動準則：你會先維持秩序，還是先了解被忽略的需求？兩者都需要保護人民的理由。",
    "decisions": [
      {
        "id": "u01-decision-1",
        "label": "以節制維持秩序",
        "text": "先讓規則與分流可見，再為例外需求留求助。",
        "tradeoff": "啟動較快，少數需求仍需專人補充。",
        "tactical": "維持原期限；全隊起始能量增加 1（上限 3）。",
        "modifiers": {
          "energyDelta": 1
        }
      },
      {
        "id": "u01-decision-2",
        "label": "由需求建立人和",
        "text": "先聽被忽略者，再配置陪同說明。",
        "tradeoff": "較貼近需求，但總服務量有限。",
        "tactical": "多 1 回合可核對與交接；維持原起始能量。",
        "modifiers": {
          "turnLimitDelta": 1
        }
      }
    ],
    "title": "橋頭的約定",
    "theme": "jade",
    "difficulty": 1,
    "turnLimit": 6,
    "briefing": "訓練機器占據橋頭。接上受困民眾，再沿狹橋撤回；掩護比清光對手更重要。",
    "strategy": "護衛守橋口，偵察員繞掩體，救援後全隊回撤離區。",
    "map": {
      "width": 8,
      "height": 6,
      "rows": [
        "........",
        "...#....",
        "E.C#..C.",
        "E..D....",
        "E.C#....",
        "...#...."
      ]
    },
    "spawns": [
      [
        1,
        2
      ],
      [
        1,
        3
      ],
      [
        1,
        4
      ]
    ],
    "civilians": [
      {
        "id": "civilian-1",
        "name": "受困民眾 1",
        "x": 6,
        "y": 3,
        "revealRound": 1
      }
    ],
    "objects": [
      {
        "id": "gate",
        "name": "橋閘控制",
        "x": 2,
        "y": 4,
        "kind": "gate",
        "required": 1,
        "dependsOn": []
      }
    ],
    "enemies": [
      {
        "id": "enemy-1",
        "role": "sentry",
        "x": 6,
        "y": 1
      },
      {
        "id": "enemy-2",
        "role": "drone",
        "x": 5,
        "y": 5
      }
    ],
    "hazards": [
      {
        "id": "bridge-signal",
        "name": "橋面警戒",
        "cells": [
          [
            4,
            3
          ]
        ],
        "rounds": [
          2,
          4,
          6
        ],
        "damage": 2
      }
    ],
    "objectiveTypes": [
      "rescue",
      "interact",
      "extract"
    ],
    "gates": [
      "gate"
    ],
    "objectives": [
      {
        "id": "rescue",
        "type": "rescue",
        "label": "救援並送回所有民眾",
        "required": 1
      },
      {
        "id": "interact",
        "type": "interact",
        "label": "完成所有任務節點",
        "objectIds": [
          "gate"
        ],
        "required": 1
      },
      {
        "id": "extract",
        "type": "extract",
        "label": "存活全隊回到撤離區",
        "required": 3
      }
    ],
    "reflection": {
      "reasonLabel": "我的理由與教材依據",
      "revisionLabel": "何時會修正做法",
      "reasonPrompt": "說明你選擇的理由、戰術代價，以及一項教材概念或頁碼。",
      "revisionPrompt": "什麼新資訊或條件會讓你修正？哪些責任尚未完成？"
    },
    "attendanceNote": "戰術勝敗不影響反思完成與當堂條件；出席仍依教師指定規則核對。",
    "trainingNote": "人物與情境皆為虛構；對手為訓練機器。技能只代表演訓資源，不提供臨床操作指引。"
  },
  {
    "id": "u02",
    "number": 2,
    "chapterTitle": "第一次服務",
    "topic": "武德的現代意義",
    "concepts": [
      {
        "term": "儒兵融合",
        "text": "方法要接受公共目的與倫理原則的檢驗，並非有用就無條件正當。"
      },
      {
        "term": "儒將與學識",
        "text": "才德、學識與責任一起被檢視；歷史革命論述有其時代背景。"
      }
    ],
    "sourceRefs": [
      {
        "file": "教材/第2章/2-2.pdf",
        "pages": [
          1,
          2,
          4,
          6,
          8
        ],
        "label": "儒兵融合、儒將與知識軍人"
      }
    ],
    "learningObjective": "把學識與公共使命轉為能執行、能查核、能修訂的服務方案。",
    "ethicalContext": "小隊想把學到的知識變成第一次衛教服務。正式開場在即，試讀者卻指出圖卡難懂。先小規模試行，或與需求代表共同設計，都必須留下查核與回饋。",
    "decisions": [
      {
        "id": "u02-decision-1",
        "label": "先試行再擴大",
        "text": "以查核、少量試讀與督導確認支持第一次服務。",
        "tradeoff": "較快得到回饋，但樣本與服務量都有限。",
        "tactical": "維持原期限；全隊起始能量增加 1（上限 3）。",
        "modifiers": {
          "energyDelta": 1
        }
      },
      {
        "id": "u02-decision-2",
        "label": "共同設計再上場",
        "text": "把讀者用語、需求討論與專業核對連起來。",
        "tradeoff": "內容較貼近需要，但討論耗時、可服務人數減少。",
        "tactical": "多 1 回合可核對與交接；維持原起始能量。",
        "modifiers": {
          "turnLimitDelta": 1
        }
      }
    ],
    "title": "訊號試行線",
    "theme": "amber",
    "difficulty": 1,
    "turnLimit": 6,
    "briefing": "先讓試行訊號可用，再把回饋帶回指揮點。兩座節點必須依序啟動，不能直接跳過驗證。",
    "strategy": "第一人開啟試讀節點，第二人向右路接力；牆角能阻斷演訓炮台。",
    "map": {
      "width": 8,
      "height": 6,
      "rows": [
        "..C.....",
        "...##.C.",
        "E.......",
        "E..~....",
        "E...##..",
        "...C...."
      ]
    },
    "spawns": [
      [
        1,
        2
      ],
      [
        1,
        3
      ],
      [
        1,
        4
      ]
    ],
    "objects": [
      {
        "id": "pilot",
        "name": "試行節點",
        "x": 3,
        "y": 0,
        "kind": "relay",
        "required": 1,
        "dependsOn": []
      },
      {
        "id": "feedback",
        "name": "回饋節點",
        "x": 6,
        "y": 4,
        "kind": "relay",
        "required": 1,
        "dependsOn": [
          "pilot"
        ]
      }
    ],
    "enemies": [
      {
        "id": "enemy-1",
        "role": "sentry",
        "x": 6,
        "y": 1
      },
      {
        "id": "enemy-2",
        "role": "drone",
        "x": 5,
        "y": 3
      }
    ],
    "hazards": [
      {
        "id": "pulse",
        "name": "測試脈衝",
        "cells": [
          [
            4,
            2
          ],
          [
            4,
            3
          ],
          [
            4,
            4
          ]
        ],
        "rounds": [
          2,
          5
        ],
        "damage": 2
      }
    ],
    "objectiveTypes": [
      "interact",
      "extract"
    ],
    "civilians": [],
    "objectives": [
      {
        "id": "interact",
        "type": "interact",
        "label": "完成所有任務節點",
        "objectIds": [
          "pilot",
          "feedback"
        ],
        "required": 2
      },
      {
        "id": "extract",
        "type": "extract",
        "label": "存活全隊回到撤離區",
        "required": 3
      }
    ],
    "reflection": {
      "reasonLabel": "我的理由與教材依據",
      "revisionLabel": "何時會修正做法",
      "reasonPrompt": "說明你選擇的理由、戰術代價，以及一項教材概念或頁碼。",
      "revisionPrompt": "什麼新資訊或條件會讓你修正？哪些責任尚未完成？"
    },
    "attendanceNote": "戰術勝敗不影響反思完成與當堂條件；出席仍依教師指定規則核對。",
    "trainingNote": "人物與情境皆為虛構；對手為訓練機器。技能只代表演訓資源，不提供臨床操作指引。"
  },
  {
    "id": "u03",
    "number": 3,
    "chapterTitle": "超出能力的求助",
    "topic": "軍人倫理（一）",
    "concepts": [
      {
        "term": "使命",
        "text": "保國衛民的責任須落實在能承擔的工作與可靠求助，不能以熱心取代資格。"
      },
      {
        "term": "倫常與分際",
        "text": "信任來自尊重、能力界線及持續回應；交出去的工作仍要有人接住。"
      }
    ],
    "sourceRefs": [
      {
        "file": "教材/第3章/軍人倫理(一).pdf",
        "pages": [
          1,
          2,
          10
        ],
        "label": "使命、角色責任與倫常基礎"
      }
    ],
    "learningObjective": "建立可追蹤的能力分工，選擇現場督導或轉介支援，並在新資訊後維持交接。",
    "ethicalContext": "一般衛教站剛開張，一位來訪者急著問牙痛的治療方法。你是軍醫學員，會使用已確認的圖卡，但沒有獨立診斷資格。督導可以支援，卻還要兼顧另一組隊員。小隊需要把求助接住，也把能力界線說清楚。",
    "decisions": [
      {
        "id": "u03-decision-1",
        "label": "現場督導示範",
        "text": "請督導到場，讓學生繼續做能力內的協助。",
        "tradeoff": "較快釐清現場誤解，但另一站的指導與候位需補位。",
        "tactical": "軍醫起始能量 3，偵察員 1。",
        "modifiers": {
          "roleEnergy": {
            "medic": 3,
            "scout": 1
          }
        }
      },
      {
        "id": "u03-decision-2",
        "label": "轉介並持續回應",
        "text": "先說明能力範圍，確認外部窗口，再保留後續追蹤。",
        "tradeoff": "保留督導人力，卻增加聯絡成本，來訪者可能仍要等待。",
        "tactical": "偵察員起始能量 3，軍醫 1。",
        "modifiers": {
          "roleEnergy": {
            "scout": 3,
            "medic": 1
          }
        }
      }
    ],
    "title": "撤離救護站",
    "theme": "teal",
    "difficulty": 1,
    "turnLimit": 5,
    "briefing": "救護站演訓警報響起。帶走2名模擬受困民眾，5回合內全隊回撤離區；不必清光訓練機器。",
    "strategy": "偵察員先用煙幕封住射線，軍醫與護衛各接一位民眾。救援後帶回綠色撤離格。",
    "map": {
      "width": 8,
      "height": 6,
      "rows": [
        "........",
        "...C....",
        "E...#...",
        "E..C..C.",
        "E.......",
        "....C..."
      ]
    },
    "spawns": [
      [
        1,
        2
      ],
      [
        1,
        3
      ],
      [
        1,
        4
      ]
    ],
    "civilians": [
      {
        "id": "civilian-1",
        "name": "受困民眾 1",
        "x": 3,
        "y": 1,
        "revealRound": 1
      },
      {
        "id": "civilian-2",
        "name": "受困民眾 2",
        "x": 6,
        "y": 3,
        "revealRound": 1
      }
    ],
    "enemies": [
      {
        "id": "enemy-1",
        "role": "sentry",
        "x": 7,
        "y": 1
      },
      {
        "id": "enemy-2",
        "role": "drone",
        "x": 6,
        "y": 5
      }
    ],
    "hazards": [
      {
        "id": "alarm",
        "name": "封鎖警示",
        "cells": [
          [
            5,
            2
          ],
          [
            5,
            3
          ]
        ],
        "rounds": [
          3,
          5
        ],
        "damage": 1
      }
    ],
    "objectiveTypes": [
      "rescue",
      "extract"
    ],
    "tutorial": [
      "每人每回合能移動一次、施技一次，順序由你決定。",
      "點隊員後點亮起的格子移動；技能再點目標。",
      "靠近民眾一格使用「救援」，帶回綠色撤離格。",
      "敵機頭頂有下一步預告；煙幕、掩護能減少反擊。",
      "目標完成後全隊回撤離區。戰術勝敗都能寫反思。"
    ],
    "objects": [],
    "objectives": [
      {
        "id": "rescue",
        "type": "rescue",
        "label": "救援並送回所有民眾",
        "required": 2
      },
      {
        "id": "extract",
        "type": "extract",
        "label": "存活全隊回到撤離區",
        "required": 3
      }
    ],
    "reflection": {
      "reasonLabel": "我的理由與教材依據",
      "revisionLabel": "何時會修正做法",
      "reasonPrompt": "說明你選擇的理由、戰術代價，以及一項教材概念或頁碼。",
      "revisionPrompt": "什麼新資訊或條件會讓你修正？哪些責任尚未完成？"
    },
    "attendanceNote": "戰術勝敗不影響反思完成與當堂條件；出席仍依教師指定規則核對。",
    "trainingNote": "人物與情境皆為虛構；對手為訓練機器。技能只代表演訓資源，不提供臨床操作指引。"
  },
  {
    "id": "u04",
    "number": 4,
    "chapterTitle": "斷線的交接",
    "topic": "軍人倫理（二）",
    "concepts": [
      {
        "term": "專業責任",
        "text": "可靠交接要有能核對的事實、責任人與下一步。"
      },
      {
        "term": "守則與情境",
        "text": "形式完成不等於真正負責；未知狀態不可據猜測簽成已完成。"
      }
    ],
    "sourceRefs": [
      {
        "file": "教材/第3章/軍人倫理(二).pdf",
        "pages": [
          1,
          5,
          8,
          16
        ],
        "label": "專業責任、規範與守則"
      }
    ],
    "learningObjective": "分開已知與待確認，建立可靠通訊、紀錄及接班回覆。",
    "ethicalContext": "接班時無線通訊中斷，交接簿只有「都好了」。一箱物品沒有本次確認紀錄，前一班暫時聯絡不到。你要保護下一班不把推測當成事實，選擇共同核對或先控管再回報。",
    "decisions": [
      {
        "id": "u04-decision-1",
        "label": "先控管再回報",
        "text": "先保留不明物品，再以事實與備援通訊回報。",
        "tradeoff": "可用物資暫時減少，資訊核對較有秩序。",
        "tactical": "維持原期限；全隊起始能量增加 1（上限 3）。",
        "modifiers": {
          "energyDelta": 1
        }
      },
      {
        "id": "u04-decision-2",
        "label": "共同核對後交接",
        "text": "由接班者參與核對，督導確認清單，取得覆述。",
        "tradeoff": "理解較完整，但雙方原工作延後。",
        "tactical": "多 1 回合可核對與交接；維持原起始能量。",
        "modifiers": {
          "turnLimitDelta": 1
        }
      }
    ],
    "title": "斷訊接力",
    "theme": "blue",
    "difficulty": 2,
    "turnLimit": 7,
    "briefing": "備援通訊斷成三段。接通前站、核對主站，再取得終站回覆；亮燈不等於全線接手。",
    "strategy": "分散站位準備接力，啟動必須遵守前站→主站→終站順序。",
    "map": {
      "width": 9,
      "height": 6,
      "rows": [
        "....#....",
        "..C.#.C..",
        "E........",
        "E.#...#..",
        "E....~...",
        "..C...C.."
      ]
    },
    "spawns": [
      [
        1,
        2
      ],
      [
        1,
        3
      ],
      [
        1,
        4
      ]
    ],
    "objects": [
      {
        "id": "source",
        "name": "前站確認",
        "x": 3,
        "y": 1,
        "kind": "relay",
        "required": 1,
        "dependsOn": []
      },
      {
        "id": "relay",
        "name": "主站核對",
        "x": 5,
        "y": 3,
        "kind": "relay",
        "required": 1,
        "dependsOn": [
          "source"
        ]
      },
      {
        "id": "receipt",
        "name": "終站覆述",
        "x": 7,
        "y": 4,
        "kind": "relay",
        "required": 1,
        "dependsOn": [
          "relay"
        ]
      }
    ],
    "enemies": [
      {
        "id": "enemy-1",
        "role": "drone",
        "x": 5,
        "y": 1
      },
      {
        "id": "enemy-2",
        "role": "sentry",
        "x": 8,
        "y": 2
      },
      {
        "id": "enemy-3",
        "role": "drone",
        "x": 7,
        "y": 5
      }
    ],
    "hazards": [
      {
        "id": "outage",
        "name": "電力脈衝",
        "cells": [
          [
            4,
            2
          ],
          [
            5,
            2
          ],
          [
            6,
            2
          ]
        ],
        "rounds": [
          2,
          4,
          6
        ],
        "damage": 2
      }
    ],
    "objectiveTypes": [
      "interact",
      "extract"
    ],
    "civilians": [],
    "objectives": [
      {
        "id": "interact",
        "type": "interact",
        "label": "完成所有任務節點",
        "objectIds": [
          "source",
          "relay",
          "receipt"
        ],
        "required": 3
      },
      {
        "id": "extract",
        "type": "extract",
        "label": "存活全隊回到撤離區",
        "required": 3
      }
    ],
    "reflection": {
      "reasonLabel": "我的理由與教材依據",
      "revisionLabel": "何時會修正做法",
      "reasonPrompt": "說明你選擇的理由、戰術代價，以及一項教材概念或頁碼。",
      "revisionPrompt": "什麼新資訊或條件會讓你修正？哪些責任尚未完成？"
    },
    "attendanceNote": "戰術勝敗不影響反思完成與當堂條件；出席仍依教師指定規則核對。",
    "trainingNote": "人物與情境皆為虛構；對手為訓練機器。技能只代表演訓資源，不提供臨床操作指引。"
  },
  {
    "id": "u05",
    "number": 5,
    "chapterTitle": "任務之外的邀請",
    "topic": "軍隊倫理（一）",
    "concepts": [
      {
        "term": "文人領軍",
        "text": "民主憲政下軍隊接受合法文人政府監督，公共任務須符合授權。"
      },
      {
        "term": "軍風與信任",
        "text": "平時對外行為會影響公共信任；軍隊身分與私人意見要辨明。"
      }
    ],
    "sourceRefs": [
      {
        "file": "教材/第4章/軍隊倫理(一).pdf",
        "pages": [
          1,
          2,
          4,
          6
        ],
        "label": "民主文武關係、文人領軍與軍風"
      }
    ],
    "learningObjective": "辨識原任務與新增安排，採修正活動或獨立服務的可追蹤方案。",
    "ethicalContext": "衛教活動核准書沒有列入額外宣傳，主辦卻邀小隊在私人政治宣傳板前合照。你要維持公共服務與尊重溝通，重新確認身分、授權與對外呈現。",
    "decisions": [
      {
        "id": "u05-decision-1",
        "label": "修正後維持服務",
        "text": "保留原站，核對新增用途並取得修正授權。",
        "tradeoff": "物資較省，但對外呈現仍需持續查核。",
        "tactical": "維持原期限；全隊起始能量增加 1（上限 3）。",
        "modifiers": {
          "energyDelta": 1
        }
      },
      {
        "id": "u05-decision-2",
        "label": "另設獨立服務站",
        "text": "以清楚身分與改址通知維持公共服務。",
        "tradeoff": "對外較清楚，但搬站耗物資、部分人可能找不到。",
        "tactical": "多 1 回合可核對與交接；維持原起始能量。",
        "modifiers": {
          "turnLimitDelta": 1
        }
      }
    ],
    "title": "獨立服務通道",
    "theme": "violet",
    "difficulty": 2,
    "turnLimit": 7,
    "briefing": "原服務點受到演訓干擾。解除入口封鎖，再護送民眾到獨立通道；公共服務的身分與用途仍要說清楚。",
    "strategy": "先開閘再接人；右側通道短但暴露，底部掩體較慢卻安全。",
    "map": {
      "width": 9,
      "height": 7,
      "rows": [
        "...#.....",
        "..C#...C.",
        "E..D.....",
        "E..#..#..",
        "E.....#..",
        "..C...C..",
        "........."
      ]
    },
    "spawns": [
      [
        1,
        2
      ],
      [
        1,
        3
      ],
      [
        1,
        4
      ]
    ],
    "objects": [
      {
        "id": "authorization",
        "name": "任務核對台",
        "x": 2,
        "y": 1,
        "kind": "gate",
        "required": 1,
        "dependsOn": []
      }
    ],
    "gates": [
      "authorization"
    ],
    "civilians": [
      {
        "id": "civilian-1",
        "name": "受困民眾 1",
        "x": 7,
        "y": 2,
        "revealRound": 1
      },
      {
        "id": "civilian-2",
        "name": "受困民眾 2",
        "x": 5,
        "y": 5,
        "revealRound": 1
      }
    ],
    "enemies": [
      {
        "id": "enemy-1",
        "role": "sentry",
        "x": 8,
        "y": 0
      },
      {
        "id": "enemy-2",
        "role": "drone",
        "x": 7,
        "y": 4
      }
    ],
    "hazards": [
      {
        "id": "spotlight",
        "name": "干擾探照",
        "cells": [
          [
            4,
            2
          ],
          [
            5,
            2
          ],
          [
            6,
            2
          ]
        ],
        "rounds": [
          1,
          3,
          5,
          7
        ],
        "damage": 2
      }
    ],
    "objectiveTypes": [
      "interact",
      "rescue",
      "extract"
    ],
    "objectives": [
      {
        "id": "interact",
        "type": "interact",
        "label": "完成所有任務節點",
        "objectIds": [
          "authorization"
        ],
        "required": 1
      },
      {
        "id": "rescue",
        "type": "rescue",
        "label": "救援並送回所有民眾",
        "required": 2
      },
      {
        "id": "extract",
        "type": "extract",
        "label": "存活全隊回到撤離區",
        "required": 3
      }
    ],
    "reflection": {
      "reasonLabel": "我的理由與教材依據",
      "revisionLabel": "何時會修正做法",
      "reasonPrompt": "說明你選擇的理由、戰術代價，以及一項教材概念或頁碼。",
      "revisionPrompt": "什麼新資訊或條件會讓你修正？哪些責任尚未完成？"
    },
    "attendanceNote": "戰術勝敗不影響反思完成與當堂條件；出席仍依教師指定規則核對。",
    "trainingNote": "人物與情境皆為虛構；對手為訓練機器。技能只代表演訓資源，不提供臨床操作指引。"
  },
  {
    "id": "u06",
    "number": 6,
    "chapterTitle": "疲勞輪值",
    "topic": "軍隊倫理（二）",
    "concepts": [
      {
        "term": "明確權責",
        "text": "不同指令要釐清優先與責任，不能把衝突交給新人成為個人失誤。"
      },
      {
        "term": "領導與尊重",
        "text": "回報困難是可靠管理的資訊來源；軍階不應抹掉需求與差異。"
      }
    ],
    "sourceRefs": [
      {
        "file": "教材/第4章/軍隊倫理(二).pdf",
        "pages": [
          1,
          2,
          6,
          10,
          13
        ],
        "label": "領導管理、軍階、權責與尊重差異"
      }
    ],
    "learningObjective": "依能力分工、安排休息與回報；新需求到來時重新部署。",
    "ethicalContext": "兩個主管同時交代工作，新隊員不敢問，後勤士官已連續輪值。小隊要選擇減量輪替或請求支援，並讓權責與困難回報真的被聽見。",
    "decisions": [
      {
        "id": "u06-decision-1",
        "label": "減量並公平輪替",
        "text": "釐清優先，安排休息，以較小規模保留品質。",
        "tradeoff": "負荷較低，但服務量少，需說明未完成需求。",
        "tactical": "維持原期限；全隊起始能量增加 1（上限 3）。",
        "modifiers": {
          "energyDelta": 1
        }
      },
      {
        "id": "u06-decision-2",
        "label": "支援加入後擴站",
        "text": "請支援、補簡報並由督導確認界線。",
        "tradeoff": "可服務較多，但管理與材料成本增加。",
        "tactical": "多 1 回合可核對與交接；維持原起始能量。",
        "modifiers": {
          "turnLimitDelta": 1
        }
      }
    ],
    "title": "輪值防線",
    "theme": "olive",
    "difficulty": 2,
    "turnLimit": 7,
    "briefing": "小隊要維持兩座避難訊號3回合，再把工作交接撤回。連續施技會累積負荷，使用掩護可調整節奏。",
    "strategy": "輪流占住標記格，醫護支援與護衛掩護交替；不要讓同一人連續承擔。",
    "map": {
      "width": 8,
      "height": 6,
      "rows": [
        "........",
        "..C..C..",
        "E..~....",
        "E.......",
        "E..~....",
        "..C..C.."
      ]
    },
    "spawns": [
      [
        1,
        2
      ],
      [
        1,
        3
      ],
      [
        1,
        4
      ]
    ],
    "objects": [
      {
        "id": "north",
        "name": "北側輪值點",
        "x": 3,
        "y": 1,
        "kind": "hold",
        "required": 3,
        "dependsOn": []
      },
      {
        "id": "south",
        "name": "南側輪值點",
        "x": 3,
        "y": 5,
        "kind": "hold",
        "required": 3,
        "dependsOn": []
      }
    ],
    "enemies": [
      {
        "id": "enemy-1",
        "role": "drone",
        "x": 6,
        "y": 1
      },
      {
        "id": "enemy-2",
        "role": "drone",
        "x": 6,
        "y": 5
      },
      {
        "id": "enemy-3",
        "role": "sentry",
        "x": 7,
        "y": 3
      }
    ],
    "hazards": [
      {
        "id": "fatigue-zone",
        "name": "負荷區",
        "cells": [
          [
            4,
            2
          ],
          [
            4,
            3
          ],
          [
            4,
            4
          ]
        ],
        "rounds": [
          2,
          4,
          6
        ],
        "damage": 1
      }
    ],
    "rules": {
      "fatigue": true
    },
    "objectiveTypes": [
      "hold",
      "extract"
    ],
    "civilians": [],
    "objectives": [
      {
        "id": "hold",
        "type": "hold",
        "label": "維持兩處輪值點",
        "objectIds": [
          "north",
          "south"
        ],
        "required": 2
      },
      {
        "id": "extract",
        "type": "extract",
        "label": "存活全隊回到撤離區",
        "required": 3
      }
    ],
    "reflection": {
      "reasonLabel": "我的理由與教材依據",
      "revisionLabel": "何時會修正做法",
      "reasonPrompt": "說明你選擇的理由、戰術代價，以及一項教材概念或頁碼。",
      "revisionPrompt": "什麼新資訊或條件會讓你修正？哪些責任尚未完成？"
    },
    "attendanceNote": "戰術勝敗不影響反思完成與當堂條件；出席仍依教師指定規則核對。",
    "trainingNote": "人物與情境皆為虛構；對手為訓練機器。技能只代表演訓資源，不提供臨床操作指引。"
  },
  {
    "id": "u07",
    "number": 7,
    "chapterTitle": "消失的物資紀錄",
    "topic": "廉政倫理（一）",
    "concepts": [
      {
        "term": "透明與問責",
        "text": "據實保留紀錄，使責任可查；公開不等於散播未確認個資。"
      },
      {
        "term": "機關分工",
        "text": "2026-10-04核對廉政署官網：政策規劃、防貪、肅貪與政風業務分工，不能由疑點直接推出犯罪。"
      }
    ],
    "sourceRefs": [
      {
        "file": "教材/第5章/廉政倫理(一).pdf",
        "pages": [
          2,
          6,
          9,
          11,
          13
        ],
        "label": "透明、治理、問責與機關分工"
      },
      {
        "file": "https://www.aac.moj.gov.tw/6398/6400/6402/53729/",
        "pages": [],
        "label": "法務部廉政署：各組（室）業務職掌；2026-10-04核對"
      }
    ],
    "learningObjective": "把疑點、程序缺口與傳聞分流，理解預防、調查與問責各有工作。",
    "ethicalContext": "物資數量與紀錄不符，有人已在走廊傳「一定被拿走」。小隊要保全資料、分開已知與傳聞，選擇流程查核或適當管道回報；不能在遊戲裡替任何人定罪。",
    "decisions": [
      {
        "id": "u07-decision-1",
        "label": "保全後查核流程",
        "text": "先核對差異與流程，保留紀錄並等回覆。",
        "tradeoff": "能處理可能漏登，但具體疑點仍需另行回報。",
        "tactical": "維持原期限；全隊起始能量增加 1（上限 3）。",
        "modifiers": {
          "energyDelta": 1
        }
      },
      {
        "id": "u07-decision-2",
        "label": "保全後據實回報",
        "text": "把疑點與傳聞分開，交適當窗口處理。",
        "tradeoff": "回報較直接，保密與資料整理需要額外時間。",
        "tactical": "多 1 回合可核對與交接；維持原起始能量。",
        "modifiers": {
          "turnLimitDelta": 1
        }
      }
    ],
    "title": "紀錄保全庫",
    "theme": "copper",
    "difficulty": 2,
    "turnLimit": 7,
    "briefing": "保全三份虛構紀錄，避免演訓掃描器干擾。數量差異只是待查線索，訓練機器也不代表被懷疑的人。",
    "strategy": "資料節點可由不同隊員分頭核對；中央掃描帶隔回合亮起，及早離開。",
    "map": {
      "width": 9,
      "height": 7,
      "rows": [
        "..C......",
        "...#..C..",
        "E..#.....",
        "E........",
        "E....#...",
        "..C..#...",
        "........."
      ]
    },
    "spawns": [
      [
        1,
        2
      ],
      [
        1,
        3
      ],
      [
        1,
        4
      ]
    ],
    "objects": [
      {
        "id": "ledger",
        "name": "領用原始紀錄",
        "x": 3,
        "y": 0,
        "kind": "record",
        "required": 1,
        "dependsOn": []
      },
      {
        "id": "handover",
        "name": "交接原始紀錄",
        "x": 7,
        "y": 1,
        "kind": "record",
        "required": 1,
        "dependsOn": []
      },
      {
        "id": "count",
        "name": "本次清點紀錄",
        "x": 6,
        "y": 5,
        "kind": "record",
        "required": 1,
        "dependsOn": []
      }
    ],
    "enemies": [
      {
        "id": "enemy-1",
        "role": "sentry",
        "x": 8,
        "y": 3
      },
      {
        "id": "enemy-2",
        "role": "drone",
        "x": 5,
        "y": 2
      },
      {
        "id": "enemy-3",
        "role": "drone",
        "x": 7,
        "y": 6
      }
    ],
    "hazards": [
      {
        "id": "scanner",
        "name": "資料庫掃描帶",
        "cells": [
          [
            4,
            0
          ],
          [
            4,
            1
          ],
          [
            4,
            2
          ],
          [
            4,
            3
          ],
          [
            4,
            4
          ],
          [
            4,
            5
          ],
          [
            4,
            6
          ]
        ],
        "rounds": [
          2,
          4,
          6
        ],
        "damage": 2
      }
    ],
    "objectiveTypes": [
      "interact",
      "extract"
    ],
    "civilians": [],
    "objectives": [
      {
        "id": "interact",
        "type": "interact",
        "label": "完成所有任務節點",
        "objectIds": [
          "ledger",
          "handover",
          "count"
        ],
        "required": 3
      },
      {
        "id": "extract",
        "type": "extract",
        "label": "存活全隊回到撤離區",
        "required": 3
      }
    ],
    "reflection": {
      "reasonLabel": "我的理由與教材依據",
      "revisionLabel": "何時會修正做法",
      "reasonPrompt": "說明你選擇的理由、戰術代價，以及一項教材概念或頁碼。",
      "revisionPrompt": "什麼新資訊或條件會讓你修正？哪些責任尚未完成？"
    },
    "attendanceNote": "戰術勝敗不影響反思完成與當堂條件；出席仍依教師指定規則核對。",
    "trainingNote": "人物與情境皆為虛構；對手為訓練機器。技能只代表演訓資源，不提供臨床操作指引。"
  },
  {
    "id": "u08",
    "number": 8,
    "chapterTitle": "附條件的補給",
    "topic": "廉政倫理（二）",
    "concepts": [
      {
        "term": "利益關係",
        "text": "公共目的不使私人條件自動適當，需核對規範與權責。"
      },
      {
        "term": "揭露與迴避",
        "text": "揭露不等於自動准許；需要時依適用規範迴避並完整交接。"
      }
    ],
    "sourceRefs": [
      {
        "file": "教材/第5章/廉政倫理(二).pdf",
        "pages": [
          3,
          5,
          6,
          7
        ],
        "label": "公款法用、利益關係與贈受財物"
      }
    ],
    "learningObjective": "核對贊助用途、利益關係與處理程序，承擔資源不足及等待的代價。",
    "ethicalContext": "廠商願意贊助，但要求推薦它的私人產品，還送隊員禮物。另有隊員與廠商存在關係。小隊要選擇婉拒重談或揭露並交接，不能用活動急迫掩蓋條件。",
    "decisions": [
      {
        "id": "u08-decision-1",
        "label": "婉拒重談，先做小站",
        "text": "核對用途、婉拒私人條件並由督導確認內容。",
        "tradeoff": "自主性較高，但可用資源減少。",
        "tactical": "維持原期限；全隊起始能量增加 1（上限 3）。",
        "modifiers": {
          "energyDelta": 1
        }
      },
      {
        "id": "u08-decision-2",
        "label": "揭露並正式交接",
        "text": "釐清關係，依規範核對迴避，再交接給適當人員。",
        "tradeoff": "責任較清楚，但查核期間服務量和時間受限。",
        "tactical": "多 1 回合可核對與交接；維持原起始能量。",
        "modifiers": {
          "turnLimitDelta": 1
        }
      }
    ],
    "title": "有限補給路",
    "theme": "orange",
    "difficulty": 3,
    "turnLimit": 7,
    "briefing": "補給短缺，兩箱已核對物資留在狹路兩端。先保全可靠物資，再撤回；不能把附帶私人條件的承諾當成已取得資源。",
    "strategy": "沿道路分頭取物資，回到補給箱旁可交接補能；慎選煙幕與支援時機。",
    "map": {
      "width": 9,
      "height": 7,
      "rows": [
        ".........",
        "..C##.C..",
        "E...~....",
        "E.#.~.#..",
        "E...~....",
        "..C##.C..",
        "........."
      ]
    },
    "spawns": [
      [
        1,
        2
      ],
      [
        1,
        3
      ],
      [
        1,
        4
      ]
    ],
    "objects": [
      {
        "id": "supplyA",
        "name": "已核對補給 A",
        "x": 6,
        "y": 0,
        "kind": "supply",
        "required": 1,
        "dependsOn": []
      },
      {
        "id": "supplyB",
        "name": "已核對補給 B",
        "x": 6,
        "y": 6,
        "kind": "supply",
        "required": 1,
        "dependsOn": []
      }
    ],
    "enemies": [
      {
        "id": "enemy-1",
        "role": "sentry",
        "x": 8,
        "y": 3
      },
      {
        "id": "enemy-2",
        "role": "drone",
        "x": 5,
        "y": 2
      },
      {
        "id": "enemy-3",
        "role": "drone",
        "x": 5,
        "y": 4
      }
    ],
    "hazards": [
      {
        "id": "logistics",
        "name": "運輸封鎖",
        "cells": [
          [
            4,
            2
          ],
          [
            4,
            4
          ]
        ],
        "rounds": [
          1,
          3,
          5,
          7
        ],
        "damage": 2
      }
    ],
    "rules": {
      "startingEnergy": 1
    },
    "objectiveTypes": [
      "interact",
      "extract"
    ],
    "civilians": [],
    "objectives": [
      {
        "id": "interact",
        "type": "interact",
        "label": "完成所有任務節點",
        "objectIds": [
          "supplyA",
          "supplyB"
        ],
        "required": 2
      },
      {
        "id": "extract",
        "type": "extract",
        "label": "存活全隊回到撤離區",
        "required": 3
      }
    ],
    "reflection": {
      "reasonLabel": "我的理由與教材依據",
      "revisionLabel": "何時會修正做法",
      "reasonPrompt": "說明你選擇的理由、戰術代價，以及一項教材概念或頁碼。",
      "revisionPrompt": "什麼新資訊或條件會讓你修正？哪些責任尚未完成？"
    },
    "attendanceNote": "戰術勝敗不影響反思完成與當堂條件；出席仍依教師指定規則核對。",
    "trainingNote": "人物與情境皆為虛構；對手為訓練機器。技能只代表演訓資源，不提供臨床操作指引。"
  },
  {
    "id": "u09",
    "number": 9,
    "chapterTitle": "規則留下的空白",
    "topic": "法制化（一）",
    "concepts": [
      {
        "term": "倫理與法律",
        "text": "兩者互有關聯而性質不同，外部約束不一律等於法律。"
      },
      {
        "term": "自律與他律",
        "text": "守規與自我要求可以共同支持責任，沒有明文禁止仍須檢視影響。"
      }
    ],
    "sourceRefs": [
      {
        "file": "教材/第6章/軍事倫理規範與實踐的法制化(一).pdf",
        "pages": [
          1,
          2,
          4,
          7,
          10
        ],
        "label": "倫理、法律、自律他律與守則"
      }
    ],
    "learningObjective": "辨認規範性質，檢查最低要求之外的影響與求助方法。",
    "ethicalContext": "服務規則沒寫候位資訊，有人說「沒有禁止就不用管」。你要分辨法律、守則與自律，選擇補資訊或建立詢問回饋，讓規則之外的責任有具體做法。",
    "decisions": [
      {
        "id": "u09-decision-1",
        "label": "先補可靠候位資訊",
        "text": "分辨規範、說明不確定性，再核對承諾。",
        "tradeoff": "較快減少資訊落差，仍可能漏掉個別需求。",
        "tactical": "維持原期限；全隊起始能量增加 1（上限 3）。",
        "modifiers": {
          "energyDelta": 1
        }
      },
      {
        "id": "u09-decision-2",
        "label": "建立詢問與修訂窗口",
        "text": "從實際影響出發，讓回覆與改善有人負責。",
        "tradeoff": "能補多樣需求，但回覆人力與時間增加。",
        "tactical": "多 1 回合可核對與交接；維持原起始能量。",
        "modifiers": {
          "turnLimitDelta": 1
        }
      }
    ],
    "title": "未標示的岔路",
    "theme": "mint",
    "difficulty": 2,
    "turnLimit": 7,
    "briefing": "路線標示缺漏。開啟求助燈，再接回兩條岔路上的民眾；只守最低要求，仍可能讓人找不到出口。",
    "strategy": "求助燈會開放近路。先派一人啟動，另兩人準備救援，可減少折返。",
    "map": {
      "width": 9,
      "height": 7,
      "rows": [
        "....#....",
        "..C.D..C.",
        "E...#....",
        "E........",
        "E...#....",
        "..C.D..C.",
        "....#...."
      ]
    },
    "spawns": [
      [
        1,
        2
      ],
      [
        1,
        3
      ],
      [
        1,
        4
      ]
    ],
    "objects": [
      {
        "id": "help",
        "name": "求助路標",
        "x": 3,
        "y": 3,
        "kind": "gate",
        "required": 1,
        "dependsOn": []
      }
    ],
    "gates": [
      "help"
    ],
    "civilians": [
      {
        "id": "civilian-1",
        "name": "受困民眾 1",
        "x": 7,
        "y": 1,
        "revealRound": 1
      },
      {
        "id": "civilian-2",
        "name": "受困民眾 2",
        "x": 7,
        "y": 5,
        "revealRound": 1
      }
    ],
    "enemies": [
      {
        "id": "enemy-1",
        "role": "sentry",
        "x": 8,
        "y": 3
      },
      {
        "id": "enemy-2",
        "role": "drone",
        "x": 5,
        "y": 1
      },
      {
        "id": "enemy-3",
        "role": "drone",
        "x": 5,
        "y": 5
      }
    ],
    "hazards": [
      {
        "id": "crossing",
        "name": "岔路警示",
        "cells": [
          [
            5,
            3
          ],
          [
            6,
            3
          ],
          [
            7,
            3
          ]
        ],
        "rounds": [
          2,
          4,
          6
        ],
        "damage": 2
      }
    ],
    "objectiveTypes": [
      "interact",
      "rescue",
      "extract"
    ],
    "objectives": [
      {
        "id": "interact",
        "type": "interact",
        "label": "完成所有任務節點",
        "objectIds": [
          "help"
        ],
        "required": 1
      },
      {
        "id": "rescue",
        "type": "rescue",
        "label": "救援並送回所有民眾",
        "required": 2
      },
      {
        "id": "extract",
        "type": "extract",
        "label": "存活全隊回到撤離區",
        "required": 3
      }
    ],
    "reflection": {
      "reasonLabel": "我的理由與教材依據",
      "revisionLabel": "何時會修正做法",
      "reasonPrompt": "說明你選擇的理由、戰術代價，以及一項教材概念或頁碼。",
      "revisionPrompt": "什麼新資訊或條件會讓你修正？哪些責任尚未完成？"
    },
    "attendanceNote": "戰術勝敗不影響反思完成與當堂條件；出席仍依教師指定規則核對。",
    "trainingNote": "人物與情境皆為虛構；對手為訓練機器。技能只代表演訓資源，不提供臨床操作指引。"
  },
  {
    "id": "u10",
    "number": 10,
    "chapterTitle": "混雜的制度消息",
    "topic": "法制化（二）",
    "concepts": [
      {
        "term": "教材時點",
        "text": "教材的102年後制度背景應與今日查核分開。"
      },
      {
        "term": "現行法",
        "text": "2026-10-04查得軍事審判法頁標示108.04.03修正，第1條區分戰時與非戰時。"
      },
      {
        "term": "政策與生效",
        "text": "114.11.03改革報告記述四法草案送審；兩部權益、懲罰法律的施行不能替代刑事軍審法的生效證據。"
      }
    ],
    "sourceRefs": [
      {
        "file": "教材/第6章/軍事倫理規範與實踐的法制化(二).pdf",
        "pages": [
          1,
          2,
          6,
          8
        ],
        "label": "廉政法律、軍事司法與法務服務"
      },
      {
        "file": "https://law.mnd.gov.tw/scp/Query4B.aspx?no=1A012705602",
        "pages": [],
        "label": "國防法規資料庫：軍事審判法；2026-10-04核對"
      },
      {
        "file": "https://www.mnd.gov.tw/publication/85284",
        "pages": [],
        "label": "國防部：軍法制度改革（114.11.03）；2026-10-04核對"
      }
    ],
    "learningObjective": "把歷史、現行法與草案分開，整理適當諮詢資料與尚未確定事項。",
    "ethicalContext": "牆上把教材年代、現行條文與政策報告貼成「新制都生效了」。小隊要核對日期、來源與效力，準備可交給法務窗口的問題，不自行認定真實案件管轄或罪名。",
    "decisions": [
      {
        "id": "u10-decision-1",
        "label": "先重建可靠制度看板",
        "text": "核對官方版本、草案狀態與效力，再更新展示。",
        "tradeoff": "減少誤導，但個案問題仍需另行諮詢。",
        "tactical": "維持原期限；全隊起始能量增加 1（上限 3）。",
        "modifiers": {
          "energyDelta": 1
        }
      },
      {
        "id": "u10-decision-2",
        "label": "先整理問題再諮詢",
        "text": "列事實與缺口，向適當窗口提供必要資料。",
        "tradeoff": "貼近問題，但要等待專業回覆，不能立即得結論。",
        "tactical": "多 1 回合可核對與交接；維持原起始能量。",
        "modifiers": {
          "turnLimitDelta": 1
        }
      }
    ],
    "title": "版本核對塔",
    "theme": "slate",
    "difficulty": 3,
    "turnLimit": 8,
    "briefing": "三座制度訊息台的日期混在一起。先查來源與時點，再核對效力，最後建立諮詢交接；不能把草案當現行規定。",
    "strategy": "依標號核對三台，後段要停留兩次互動。煙幕能讓隊友安全完成長交接。",
    "map": {
      "width": 10,
      "height": 7,
      "rows": [
        "....#.....",
        "..C.#...C.",
        "E...D.....",
        "E.#...#...",
        "E.....#.C.",
        "..C..~....",
        "......C..."
      ]
    },
    "spawns": [
      [
        1,
        2
      ],
      [
        1,
        3
      ],
      [
        1,
        4
      ]
    ],
    "objects": [
      {
        "id": "date",
        "name": "①來源與時點",
        "x": 3,
        "y": 1,
        "kind": "gate",
        "required": 1,
        "dependsOn": []
      },
      {
        "id": "effect",
        "name": "②效力核對",
        "x": 6,
        "y": 2,
        "kind": "relay",
        "required": 1,
        "dependsOn": [
          "date"
        ]
      },
      {
        "id": "advice",
        "name": "③諮詢交接",
        "x": 8,
        "y": 5,
        "kind": "relay",
        "required": 2,
        "dependsOn": [
          "effect"
        ]
      }
    ],
    "gates": [
      "date"
    ],
    "enemies": [
      {
        "id": "enemy-1",
        "role": "sentry",
        "x": 9,
        "y": 2
      },
      {
        "id": "enemy-2",
        "role": "drone",
        "x": 7,
        "y": 4
      },
      {
        "id": "enemy-3",
        "role": "sentry",
        "x": 9,
        "y": 6
      }
    ],
    "hazards": [
      {
        "id": "tower",
        "name": "塔台干擾",
        "cells": [
          [
            5,
            2
          ],
          [
            6,
            2
          ],
          [
            7,
            2
          ]
        ],
        "rounds": [
          2,
          5,
          8
        ],
        "damage": 2
      }
    ],
    "objectiveTypes": [
      "interact",
      "extract"
    ],
    "civilians": [],
    "objectives": [
      {
        "id": "interact",
        "type": "interact",
        "label": "完成所有任務節點",
        "objectIds": [
          "date",
          "effect",
          "advice"
        ],
        "required": 3
      },
      {
        "id": "extract",
        "type": "extract",
        "label": "存活全隊回到撤離區",
        "required": 3
      }
    ],
    "reflection": {
      "reasonLabel": "我的理由與教材依據",
      "revisionLabel": "何時會修正做法",
      "reasonPrompt": "說明你選擇的理由、戰術代價，以及一項教材概念或頁碼。",
      "revisionPrompt": "什麼新資訊或條件會讓你修正？哪些責任尚未完成？"
    },
    "attendanceNote": "戰術勝敗不影響反思完成與當堂條件；出席仍依教師指定規則核對。",
    "trainingNote": "人物與情境皆為虛構；對手為訓練機器。技能只代表演訓資源，不提供臨床操作指引。"
  },
  {
    "id": "u11",
    "number": 11,
    "chapterTitle": "利益與正義的交鋒",
    "topic": "戰爭倫理（一）",
    "concepts": [
      {
        "term": "歷史脈絡",
        "text": "不能由歷史勝敗直接推道德優劣。"
      },
      {
        "term": "正義與利益",
        "text": "利益能解釋行動，仍要檢查其證據、代價與正當性。"
      },
      {
        "term": "權力不對稱",
        "text": "力量會改變誰能拒絕，表面同意未必足以證成。"
      }
    ],
    "sourceRefs": [
      {
        "file": "教材/第7章/戰爭倫理(一).pdf",
        "pages": [
          1,
          2,
          3,
          4,
          9
        ],
        "label": "歷史脈絡、兩場辯論與義利問題"
      }
    ],
    "learningObjective": "公平重述論點，檢查安全、利益與權力，保留反例與修正條件。",
    "ethicalContext": "小隊在歷史辯論庭聽見「只要有力量就有理由」。史料包含宋襄公、斯巴達與雅典、雅典與彌羅斯。你要分辨解釋動機與證成正當，選擇檢查證據或讓被排除者發聲。",
    "decisions": [
      {
        "id": "u11-decision-1",
        "label": "由證據與反例檢查",
        "text": "核對證據、公平重述對方，再以反例設定修正條件。",
        "tradeoff": "論證較可查證，仍需補被排除者的經驗。",
        "tactical": "維持原期限；全隊起始能量增加 1（上限 3）。",
        "modifiers": {
          "energyDelta": 1
        }
      },
      {
        "id": "u11-decision-2",
        "label": "由弱者與權力檢查",
        "text": "納入被排除的風險、中立理由與拒絕能力。",
        "tradeoff": "能看到不對稱代價，但歷史事實仍須持續查證。",
        "tactical": "多 1 回合可核對與交接；維持原起始能量。",
        "modifiers": {
          "turnLimitDelta": 1
        }
      }
    ],
    "title": "雙岸救援",
    "theme": "indigo",
    "difficulty": 3,
    "turnLimit": 8,
    "briefing": "兩岸都有模擬受困者，中間通道最短但暴露。戰果不能代替理由；請比較哪一群人承擔你的策略代價。",
    "strategy": "一人牽制中央訓練機器，兩人分走上下窄道；不需要擊倒高耐久守門機。",
    "map": {
      "width": 10,
      "height": 7,
      "rows": [
        "...C......",
        "....##....",
        "E......C..",
        "E.##..##..",
        "E......C..",
        "....##....",
        "...C......"
      ]
    },
    "spawns": [
      [
        1,
        2
      ],
      [
        1,
        3
      ],
      [
        1,
        4
      ]
    ],
    "civilians": [
      {
        "id": "civilian-1",
        "name": "受困民眾 1",
        "x": 8,
        "y": 1,
        "revealRound": 1
      },
      {
        "id": "civilian-2",
        "name": "受困民眾 2",
        "x": 8,
        "y": 5,
        "revealRound": 1
      }
    ],
    "enemies": [
      {
        "id": "enemy-1",
        "role": "bulwark",
        "x": 5,
        "y": 3
      },
      {
        "id": "enemy-2",
        "role": "sentry",
        "x": 9,
        "y": 0
      },
      {
        "id": "enemy-3",
        "role": "sentry",
        "x": 9,
        "y": 6
      }
    ],
    "hazards": [
      {
        "id": "middle",
        "name": "中央射界",
        "cells": [
          [
            4,
            2
          ],
          [
            5,
            2
          ],
          [
            4,
            4
          ],
          [
            5,
            4
          ]
        ],
        "rounds": [
          1,
          3,
          5,
          7
        ],
        "damage": 2
      }
    ],
    "objectiveTypes": [
      "rescue",
      "extract"
    ],
    "objects": [],
    "objectives": [
      {
        "id": "rescue",
        "type": "rescue",
        "label": "救援並送回所有民眾",
        "required": 2
      },
      {
        "id": "extract",
        "type": "extract",
        "label": "存活全隊回到撤離區",
        "required": 3
      }
    ],
    "reflection": {
      "reasonLabel": "我的理由與教材依據",
      "revisionLabel": "何時會修正做法",
      "reasonPrompt": "說明你選擇的理由、戰術代價，以及一項教材概念或頁碼。",
      "revisionPrompt": "什麼新資訊或條件會讓你修正？哪些責任尚未完成？"
    },
    "attendanceNote": "戰術勝敗不影響反思完成與當堂條件；出席仍依教師指定規則核對。",
    "trainingNote": "人物與情境皆為虛構；對手為訓練機器。技能只代表演訓資源，不提供臨床操作指引。"
  },
  {
    "id": "u12",
    "number": 12,
    "chapterTitle": "保護區的新情報",
    "topic": "戰爭倫理（二）",
    "concepts": [
      {
        "term": "開戰正義",
        "text": "理由、權威、意圖、最後手段、成功可能性與相稱性需一起檢視。"
      },
      {
        "term": "交戰正義",
        "text": "目的正當不取消區分與相稱對行動方式的限制。"
      },
      {
        "term": "不確定性",
        "text": "未知不等於任意猜測，來源更新應帶來再評估。"
      }
    ],
    "sourceRefs": [
      {
        "file": "教材/第7章/戰爭倫理(二).pdf",
        "pages": [
          2,
          6,
          7,
          8,
          9,
          10,
          20
        ],
        "label": "正義戰爭傳統、開戰與交戰層次"
      }
    ],
    "learningObjective": "區分開戰與交戰層次，對未知保留保護與查證，新資料到來後修訂。",
    "ethicalContext": "抽象演訓圖上，A區已確認為非戰鬥人員避難點，C區身分未明。你只能配置查證、保護與交接，沒有攻擊操作。新資訊可能改變保護範圍，正當目的不免除手段責任。",
    "decisions": [
      {
        "id": "u12-decision-1",
        "label": "持續查核並協作更新",
        "text": "核對來源，建立回報，再確認更新後修訂責任。",
        "tradeoff": "資訊較可靠，耗時間且仍要維持保護不中斷。",
        "tactical": "維持原期限；全隊起始能量增加 1（上限 3）。",
        "modifiers": {
          "energyDelta": 1
        }
      },
      {
        "id": "u12-decision-2",
        "label": "保護導向預留擴充",
        "text": "先採暫行保護，預留擴區材料，核對區分界線。",
        "tradeoff": "較能因應新需求，但有限物資減少，仍需查證。",
        "tactical": "多 1 回合可核對與交接；維持原起始能量。",
        "modifiers": {
          "turnLimitDelta": 1
        }
      }
    ],
    "title": "擴大的保護區",
    "theme": "rose",
    "difficulty": 3,
    "turnLimit": 8,
    "briefing": "已知避難點有兩人，第三區仍待確認。第2回合新情報會加入一名受困者，請預留救援人力與回程。所有對手都是演訓機器。",
    "strategy": "首回合接近兩翼，中央留一人因應新情報。保護需求增加後再調整煙幕與路線。",
    "map": {
      "width": 10,
      "height": 7,
      "rows": [
        "..........",
        "..C..#..C.",
        "E....#....",
        "E..C......",
        "E....#....",
        "..C..#..C.",
        ".........."
      ]
    },
    "spawns": [
      [
        1,
        2
      ],
      [
        1,
        3
      ],
      [
        1,
        4
      ]
    ],
    "civilians": [
      {
        "id": "civilian-1",
        "name": "受困民眾 1",
        "x": 6,
        "y": 0,
        "revealRound": 1
      },
      {
        "id": "civilian-2",
        "name": "受困民眾 2",
        "x": 6,
        "y": 6,
        "revealRound": 1
      },
      {
        "id": "civilian-3",
        "name": "受困民眾 3",
        "x": 7,
        "y": 3,
        "revealRound": 2
      }
    ],
    "enemies": [
      {
        "id": "enemy-1",
        "role": "sentry",
        "x": 9,
        "y": 1
      },
      {
        "id": "enemy-2",
        "role": "sentry",
        "x": 9,
        "y": 5
      },
      {
        "id": "enemy-3",
        "role": "drone",
        "x": 6,
        "y": 3
      }
    ],
    "hazards": [
      {
        "id": "protection",
        "name": "保護區警報",
        "cells": [
          [
            7,
            2
          ],
          [
            7,
            3
          ],
          [
            7,
            4
          ]
        ],
        "rounds": [
          3,
          5,
          7
        ],
        "damage": 2
      }
    ],
    "objectiveTypes": [
      "rescue",
      "extract"
    ],
    "objects": [],
    "objectives": [
      {
        "id": "rescue",
        "type": "rescue",
        "label": "救援並送回所有民眾",
        "required": 3
      },
      {
        "id": "extract",
        "type": "extract",
        "label": "存活全隊回到撤離區",
        "required": 3
      }
    ],
    "reflection": {
      "reasonLabel": "我的理由與教材依據",
      "revisionLabel": "何時會修正做法",
      "reasonPrompt": "說明你選擇的理由、戰術代價，以及一項教材概念或頁碼。",
      "revisionPrompt": "什麼新資訊或條件會讓你修正？哪些責任尚未完成？"
    },
    "attendanceNote": "戰術勝敗不影響反思完成與當堂條件；出席仍依教師指定規則核對。",
    "trainingNote": "人物與情境皆為虛構；對手為訓練機器。技能只代表演訓資源，不提供臨床操作指引。"
  },
  {
    "id": "u13",
    "number": 13,
    "chapterTitle": "綜合服務危機",
    "topic": "倫理實踐技術",
    "concepts": [
      {
        "term": "九步驟",
        "text": "定義問題、辨明關係人責任規範、反思價值、編擬方案、推理評估、諮詢自省、選擇、執行、評估回饋；實務可回頭修訂。"
      },
      {
        "term": "多元倫理",
        "text": "義務、效益、德行與不傷害、人權、公平各有貢獻，不以單一服務量決定一切。"
      },
      {
        "term": "公款法用",
        "text": "公共目的不免除守規，未完成事項不能填成已交付。"
      }
    ],
    "sourceRefs": [
      {
        "file": "教材/第8章/軍事倫理的實踐技術.pdf",
        "pages": [
          2,
          15,
          17,
          18,
          19,
          20,
          23
        ],
        "label": "道德推理、多元倫理、九步驟與公款法用"
      }
    ],
    "learningObjective": "串連九步驟：問題、責任、價值、兩方案、評估、諮詢、選擇、執行與回饋。",
    "ethicalContext": "最後一次演訓同時面對短時需求、大字材料延誤與疲勞隊員。廠商說未交付也能先開完成單。小隊要比較現場分流與後續協作，諮詢後執行，再據新資訊修訂，不用假紀錄遮蓋。",
    "decisions": [
      {
        "id": "u13-decision-1",
        "label": "現場分流與可近用替代",
        "text": "比較方案、諮詢並核對現有材料，以現場能做部分回應需求。",
        "tradeoff": "可立即協助，服務量較少、隊員負荷增加。",
        "tactical": "維持原期限；全隊起始能量增加 1（上限 3）。",
        "modifiers": {
          "energyDelta": 1
        }
      },
      {
        "id": "u13-decision-2",
        "label": "個別協作與據實追蹤",
        "text": "確認後續可行性、聯絡接手並核對修訂條件。",
        "tradeoff": "可保留後續責任，但等待者可能仍無法參與。",
        "tactical": "多 1 回合可核對與交接；維持原起始能量。",
        "modifiers": {
          "turnLimitDelta": 1
        }
      }
    ],
    "title": "最後的交接線",
    "theme": "gold",
    "difficulty": 4,
    "turnLimit": 9,
    "briefing": "最後演訓同時有兩位受困者、未完成紀錄與逐段干擾。先建立接手線，再完成救援與據實交接，最後全隊撤回。",
    "strategy": "用三人分工完成通訊、救援、護衛；優先保留出口與補給，不用全殲硬拚。",
    "map": {
      "width": 11,
      "height": 8,
      "rows": [
        "...C.......",
        "....#..C...",
        "E...D......",
        "E.#....#...",
        "E....C.....",
        "....#...#..",
        "..C....C...",
        "..........."
      ]
    },
    "spawns": [
      [
        1,
        2
      ],
      [
        1,
        3
      ],
      [
        1,
        4
      ]
    ],
    "objects": [
      {
        "id": "contact",
        "name": "接手聯絡線",
        "x": 3,
        "y": 1,
        "kind": "gate",
        "required": 1,
        "dependsOn": []
      },
      {
        "id": "record",
        "name": "據實完成紀錄",
        "x": 8,
        "y": 4,
        "kind": "record",
        "required": 2,
        "dependsOn": [
          "contact"
        ]
      }
    ],
    "gates": [
      "contact"
    ],
    "civilians": [
      {
        "id": "civilian-1",
        "name": "受困民眾 1",
        "x": 7,
        "y": 1,
        "revealRound": 1
      },
      {
        "id": "civilian-2",
        "name": "受困民眾 2",
        "x": 8,
        "y": 6,
        "revealRound": 1
      }
    ],
    "enemies": [
      {
        "id": "enemy-1",
        "role": "sentry",
        "x": 10,
        "y": 2
      },
      {
        "id": "enemy-2",
        "role": "drone",
        "x": 6,
        "y": 4
      },
      {
        "id": "enemy-3",
        "role": "sentry",
        "x": 10,
        "y": 6
      },
      {
        "id": "enemy-4",
        "role": "bulwark",
        "x": 8,
        "y": 3
      }
    ],
    "hazards": [
      {
        "id": "rolling",
        "name": "逐段干擾",
        "cells": [
          [
            5,
            2
          ],
          [
            5,
            3
          ],
          [
            5,
            4
          ],
          [
            5,
            5
          ]
        ],
        "rounds": [
          2,
          4,
          6,
          8
        ],
        "damage": 2
      }
    ],
    "rules": {
      "fatigue": true
    },
    "objectiveTypes": [
      "interact",
      "rescue",
      "extract"
    ],
    "objectives": [
      {
        "id": "interact",
        "type": "interact",
        "label": "完成所有任務節點",
        "objectIds": [
          "contact",
          "record"
        ],
        "required": 2
      },
      {
        "id": "rescue",
        "type": "rescue",
        "label": "救援並送回所有民眾",
        "required": 2
      },
      {
        "id": "extract",
        "type": "extract",
        "label": "存活全隊回到撤離區",
        "required": 3
      }
    ],
    "reflection": {
      "reasonLabel": "我的理由與教材依據",
      "revisionLabel": "何時會修正做法",
      "reasonPrompt": "說明你選擇的理由、戰術代價，以及一項教材概念或頁碼。",
      "revisionPrompt": "什麼新資訊或條件會讓你修正？哪些責任尚未完成？"
    },
    "attendanceNote": "戰術勝敗不影響反思完成與當堂條件；出席仍依教師指定規則核對。",
    "trainingNote": "人物與情境皆為虛構；對手為訓練機器。技能只代表演訓資源，不提供臨床操作指引。"
  }
];
const legend={'.':{type:'floor',name:'平地',passable:true,cost:1,cover:0},'#':{type:'wall',name:'障礙',passable:false,cost:0,cover:0},C:{type:'cover',name:'掩體',passable:true,cost:1,cover:1},'~':{type:'rough',name:'緩行地',passable:true,cost:2,cover:0},E:{type:'exit',name:'撤離區',passable:true,cost:1,cover:0},D:{type:'door',name:'連動閘門',passable:false,cost:1,cover:0},'!':{type:'hazard',name:'警示區',passable:true,cost:1,cover:0}};
function freeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);Object.values(v).forEach(freeze);}return v;}
missions.forEach(m=>{m.map.legend=legend;delete m.objectiveTypes;freeze(m);});
function getMission(id){return missions.find(m=>m.id===id)||null;}
return freeze({CONTENT_VERSION,contentVersion:CONTENT_VERSION,missions,getMission,get:getMission,legend,[Symbol.iterator]:function*(){yield* missions;}});
});
