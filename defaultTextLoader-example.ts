/**
 * DefaultTextLoader 使用示例和数据结构说明
 * 
 * 这个文件展示了如何使用 defaultTextLoader.ts 模块
 * 以及返回的数据结构示例
 */

import { loadDefaultText, type DefaultText } from "./netlify/functions/lib/defaultTextLoader";

// ============================================================================
// 数据结构示例
// ============================================================================

/**
 * DefaultText 类型定义
 * 包含所有 Word 模板占位符的默认值
 */
const exampleDefaultText: DefaultText = {
  // 基本信息
  INSPECTION_ID: "N/A",
  ASSESSMENT_DATE: "Date not available",
  PREPARED_FOR: "Client information not provided",
  PREPARED_BY: "Better Home Technology Pty Ltd",
  PROPERTY_ADDRESS: "Address not provided",
  PROPERTY_TYPE: "Property type not specified",
  
  // Findings 部分
  IMMEDIATE_FINDINGS: "No immediate safety risks were identified at the time of inspection.",
  RECOMMENDED_FINDINGS: "No items requiring short-term planned action were identified at the time of inspection.",
  PLAN_FINDINGS: "No additional items were identified for planning or monitoring at this time.",
  LIMITATIONS: "This assessment is non-invasive and limited to accessible areas only.",
  URGENT_FINDINGS: "No immediate safety risks were identified at the time of inspection.",
  
  // 报告元数据
  REPORT_VERSION: "1.0",
  OVERALL_STATUS: "Satisfactory",
  EXECUTIVE_SUMMARY: "No significant issues identified during this inspection.",
  RISK_RATING: "LOW",
  RISK_RATING_FACTORS: "No significant risk factors identified",
  
  // 技术部分
  TEST_SUMMARY: "Electrical safety inspection completed in accordance with applicable standards.",
  TECHNICAL_NOTES: "This is a non-invasive visual inspection limited to accessible areas.",
};

// ============================================================================
// 使用示例
// ============================================================================

/**
 * 示例 1: 基本使用（无 event）
 */
async function example1() {
  const defaultText = await loadDefaultText();
  console.log("Default INSPECTION_ID:", defaultText.INSPECTION_ID);
  console.log("Default ASSESSMENT_DATE:", defaultText.ASSESSMENT_DATE);
}

/**
 * 示例 2: 在 Netlify Function 中使用（带 event）
 */
async function example2(event: any) {
  // 优先从 Blob Store 加载，后备文件系统
  const defaultText = await loadDefaultText(event);
  
  // 使用默认值作为兜底
  const inspectionId = actualInspectionId || defaultText.INSPECTION_ID;
  const assessmentDate = actualDate || defaultText.ASSESSMENT_DATE;
}

/**
 * 示例 3: 在 buildReportData 中使用
 */
async function example3() {
  const defaultText = await loadDefaultText();
  
  // 构建 templateData，使用默认值作为兜底
  const templateData: Record<string, string> = {
    INSPECTION_ID: inspection_id || defaultText.INSPECTION_ID,
    ASSESSMENT_DATE: assessmentDate || defaultText.ASSESSMENT_DATE,
    PREPARED_FOR: preparedFor || defaultText.PREPARED_FOR,
    PREPARED_BY: preparedBy || defaultText.PREPARED_BY,
    PROPERTY_ADDRESS: propertyAddress || defaultText.PROPERTY_ADDRESS,
    PROPERTY_TYPE: propertyType || defaultText.PROPERTY_TYPE,
    IMMEDIATE_FINDINGS: immediateText || defaultText.IMMEDIATE_FINDINGS,
    RECOMMENDED_FINDINGS: recommendedText || defaultText.RECOMMENDED_FINDINGS,
    PLAN_FINDINGS: planText || defaultText.PLAN_FINDINGS,
    LIMITATIONS: limitationsText || defaultText.LIMITATIONS,
    REPORT_VERSION: "1.0" || defaultText.REPORT_VERSION,
    OVERALL_STATUS: overallStatus || defaultText.OVERALL_STATUS,
    EXECUTIVE_SUMMARY: executiveSummary || defaultText.EXECUTIVE_SUMMARY,
    RISK_RATING: riskRating || defaultText.RISK_RATING,
    RISK_RATING_FACTORS: riskRatingFactors || defaultText.RISK_RATING_FACTORS,
    URGENT_FINDINGS: urgentFindings || defaultText.URGENT_FINDINGS,
    TEST_SUMMARY: testSummary || defaultText.TEST_SUMMARY,
    TECHNICAL_NOTES: technicalNotes || defaultText.TECHNICAL_NOTES,
  };
}

/**
 * 示例 4: 使用 Object.assign 简化代码
 */
async function example4() {
  const defaultText = await loadDefaultText();
  
  // 先设置默认值
  const templateData: Record<string, string> = { ...defaultText };
  
  // 然后用实际值覆盖（如果存在）
  if (inspection_id) templateData.INSPECTION_ID = inspection_id;
  if (assessmentDate) templateData.ASSESSMENT_DATE = assessmentDate;
  if (preparedFor) templateData.PREPARED_FOR = preparedFor;
  // ... 等等
}

// ============================================================================
// Markdown 文件格式说明
// ============================================================================

/**
 * DEFAULT_REPORT_TEXT.md 文件格式：
 * 
 * # Default Report Text
 * 
 * ## Word Template Placeholders
 * 
 * ### INSPECTION_ID
 * N/A
 * 
 * ### ASSESSMENT_DATE
 * Date not available
 * 
 * ### PREPARED_FOR
 * Client information not provided
 * 
 * ...
 * 
 * 规则：
 * 1. 使用 ### 作为占位符名称的标题
 * 2. 占位符名称必须是大写字母、数字和下划线（A-Z0-9_）
 * 3. 标题后的内容（直到下一个 ### 或文件结束）是该占位符的默认值
 * 4. 支持多行文本（保留换行符）
 * 5. 如果某个占位符在文件中不存在，会使用内置的 fallback 值
 */

// ============================================================================
// 数据结构完整说明
// ============================================================================

/**
 * DefaultText 接口说明：
 * 
 * 所有字段都是 string 类型，确保不会出现 undefined
 * 
 * 字段分类：
 * 
 * 1. 基本信息（6个）
 *    - INSPECTION_ID: 检查 ID
 *    - ASSESSMENT_DATE: 评估日期
 *    - PREPARED_FOR: 为客户准备
 *    - PREPARED_BY: 由谁准备
 *    - PROPERTY_ADDRESS: 物业地址
 *    - PROPERTY_TYPE: 物业类型
 * 
 * 2. Findings 部分（5个）
 *    - IMMEDIATE_FINDINGS: 紧急发现
 *    - RECOMMENDED_FINDINGS: 推荐发现
 *    - PLAN_FINDINGS: 计划发现
 *    - LIMITATIONS: 限制条件
 *    - URGENT_FINDINGS: 紧急发现（等同于 IMMEDIATE_FINDINGS）
 * 
 * 3. 报告元数据（5个）
 *    - REPORT_VERSION: 报告版本
 *    - OVERALL_STATUS: 总体状态
 *    - EXECUTIVE_SUMMARY: 执行摘要
 *    - RISK_RATING: 风险评级
 *    - RISK_RATING_FACTORS: 风险评级因素
 * 
 * 4. 技术部分（2个）
 *    - TEST_SUMMARY: 测试摘要
 *    - TECHNICAL_NOTES: 技术说明
 * 
 * 5. 扩展字段
 *    - [key: string]: string 允许添加额外的占位符
 */

export { exampleDefaultText };
