# BILL_FEEDBACK_LOOP

## 目的

将报告中的电费区间估算从“可解释”逐步校准到“更贴近客户真实账单”。

## 7天回收流程（先人工执行）

1. 报告交付后第 7 天发送回收提醒（邮件/短信）。  
2. 请求客户提交最近两期账单与资费信息。  
3. 回收后由内部人员更新 tariff 与 avg factor 假设。  
4. 记录校准前后差异（low/typ 区间偏差）。

## 需客户提供字段

- 最近两期账单（总金额、计费区间）
- 当前 tariff（c/kWh、supply c/day）
- 是否有 solar feed-in（以及 feed-in 相关单价，若可得）
- 账单对应期间是否有异常用电事件（装修、设备故障、空置等）

## 校准方法（v1）

1. 优先更新客户真实 tariff（替代 default estimate）。  
2. 根据账单偏差调节 `avgFactorLow` / `avgFactorTyp`。  
3. 保留“Measured / Assumptions / Next actions”说明透明度，不承诺账单绝对值。  

## 当前状态

- 已提供回收邮件模板；
- 暂未接入自动触达与自动回写，后续可接 CRM/消息系统。
