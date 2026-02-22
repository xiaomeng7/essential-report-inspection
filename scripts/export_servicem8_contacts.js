/**
 * ServiceM8 客户联系方式导出脚本
 * 从 ServiceM8 API 提取客户数据，生成 CSV 用于推广活动
 *
 * 使用方法:
 *   1. 设置 API_KEY 或环境变量 SERVICEM8_API_KEY
 *   2. 运行: node scripts/export_servicem8_contacts.js
 *
 * 输出文件:
 *   - servicem8_all_clients.csv         (所有客户)
 *   - servicem8_investment_clients.csv  (投资房客户)
 *   - servicem8_active_clients.csv      (活跃客户，过去12个月有工单)
 */

const https = require('https');
const fs = require('fs');

// ============================================
// 配置区域 - 请填写你的 ServiceM8 API Key
// ============================================
const API_KEY = process.env.SERVICEM8_API_KEY || 'YOUR_API_KEY_HERE';

// ServiceM8 使用 X-API-Key 认证 (非 Bearer)
const API_BASE = 'https://api.servicem8.com';

// ============================================
// API 请求函数
// ============================================

/**
 * 发送 GET 请求到 ServiceM8 API
 */
function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(new Error(`JSON解析失败: ${err.message}`));
          }
        } else if (res.statusCode === 401) {
          reject(new Error('认证失败! 请检查API Key是否正确'));
        } else if (res.statusCode === 403) {
          reject(new Error('权限不足! 请确认API Key有读取权限'));
        } else {
          reject(new Error(`API 请求失败: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`网络错误: ${error.message}`));
    });

    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('请求超时(15秒)'));
    });

    req.end();
  });
}

/**
 * 从 ServiceM8 获取所有客户(公司)
 */
async function fetchAllCompanies() {
  console.log('📥 获取客户(公司)数据...');
  try {
    const companies = await makeRequest('/api_1.0/company.json');
    console.log(`   ✅ 获取到 ${companies.length} 个公司/客户`);
    return Array.isArray(companies) ? companies : [];
  } catch (error) {
    console.error(`   ❌ 获取公司数据失败: ${error.message}`);
    return [];
  }
}

/**
 * 从 ServiceM8 获取所有联系人
 */
async function fetchAllContacts() {
  console.log('📥 获取联系人数据...');
  try {
    const contacts = await makeRequest('/api_1.0/companycontact.json');
    console.log(`   ✅ 获取到 ${contacts.length} 个联系人`);
    return Array.isArray(contacts) ? contacts : [];
  } catch (error) {
    console.error(`   ❌ 获取联系人数据失败: ${error.message}`);
    return [];
  }
}

/**
 * 获取所有已完成的工单
 */
async function fetchCompletedJobs() {
  console.log('📥 获取工单数据...');
  try {
    const filter = encodeURIComponent("status eq 'Completed'");
    const jobs = await makeRequest(`/api_1.0/job.json?$filter=${filter}`);
    console.log(`   ✅ 获取到 ${jobs.length} 个已完成工单`);
    return Array.isArray(jobs) ? jobs : [];
  } catch (error) {
    console.error(`   ❌ 获取工单数据失败: ${error.message}`);
    return [];
  }
}

// ============================================
// 数据处理函数
// ============================================

/**
 * 清洗和格式化电话号码
 */
function cleanPhone(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^\d]/g, '');
  if (cleaned.length === 10 && cleaned.startsWith('0')) {
    cleaned = '61' + cleaned.substring(1);
  }
  return cleaned;
}

/**
 * 格式化电话号码为显示格式
 */
function formatPhone(phone) {
  if (!phone) return '';
  const cleaned = cleanPhone(phone);
  if (cleaned.startsWith('61') && cleaned.length === 11) {
    return `+61 ${cleaned.substring(2, 5)} ${cleaned.substring(5, 8)} ${cleaned.substring(8)}`;
  }
  return String(phone);
}

/**
 * 验证邮箱格式
 */
function isValidEmail(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email));
}

/**
 * 构建完整地址
 */
function buildAddress(record) {
  const parts = [
    record.address || '',
    record.city || '',
    record.state || '',
    record.postcode || '',
  ].filter((p) => p);
  return parts.join(', ');
}

/**
 * 合并客户和联系人数据
 */
function mergeData(companies, contacts, jobs) {
  const clientMap = new Map();

  companies.forEach((company) => {
    const uuid = company.uuid;
    clientMap.set(uuid, {
      uuid,
      companyName: company.name || '',
      contactName: '',
      email: company.email || '',
      phone: formatPhone(company.mobile || company.phone || ''),
      address: buildAddress(company),
      type: 'Company',
      lastJobDate: '',
      totalJobs: 0,
      notes: company.notes || '',
    });
  });

  contacts.forEach((contact) => {
    const companyUUID = contact.company_uuid;

    if (companyUUID && clientMap.has(companyUUID)) {
      const company = clientMap.get(companyUUID);
      const name = `${contact.first || ''} ${contact.last || ''}`.trim();
      if (name) company.contactName = name;
      if (contact.email) company.contactEmail = contact.email;
      const ph = formatPhone(contact.mobile || contact.phone || '');
      if (ph) company.contactPhone = ph;
    } else {
      const uuid = contact.uuid;
      const name = `${contact.first || ''} ${contact.last || ''}`.trim();
      clientMap.set(uuid, {
        uuid,
        companyName: '',
        contactName: name,
        email: contact.email || '',
        phone: formatPhone(contact.mobile || contact.phone || ''),
        address: buildAddress(contact),
        type: 'Individual',
        lastJobDate: '',
        totalJobs: 0,
        notes: contact.notes || '',
      });
    }
  });

  jobs.forEach((job) => {
    const companyUUID = job.company_uuid;
    if (companyUUID && clientMap.has(companyUUID)) {
      const client = clientMap.get(companyUUID);
      client.totalJobs++;
      if (job.job_date) {
        const jobDate = new Date(job.job_date);
        if (!client.lastJobDate || jobDate > new Date(client.lastJobDate)) {
          client.lastJobDate = job.job_date;
        }
      }
    }
  });

  return Array.from(clientMap.values());
}

/**
 * 筛选有效客户 (有邮箱或手机号)
 */
function filterValidClients(clients) {
  return clients.filter((client) => {
    const hasEmail = isValidEmail(client.email) || isValidEmail(client.contactEmail);
    const hasPhone =
      (client.phone && client.phone.replace(/\D/g, '').length >= 10) ||
      (client.contactPhone && client.contactPhone.replace(/\D/g, '').length >= 10);
    return hasEmail || hasPhone;
  });
}

/**
 * 分类客户 (投资房主 vs 普通住宅)
 */
function categorizeClients(clients) {
  const investmentKeywords = [
    'investment',
    'rental',
    'tenant',
    'landlord',
    'property manager',
    'investor',
    'lease',
    'rent',
    'ip',
    'inv prop',
    'investment property',
    '投资房',
    '出租',
    '房东',
  ];

  return clients.map((client) => {
    const address = (client.address || '').toLowerCase();
    const notes = (client.notes || '').toLowerCase();
    const name = (client.companyName || client.contactName || '').toLowerCase();

    const isInvestmentProperty = investmentKeywords.some(
      (keyword) =>
        address.includes(keyword) || notes.includes(keyword) || name.includes(keyword)
    );

    return {
      ...client,
      category: isInvestmentProperty ? 'Investment Property' : 'Residential',
      priority: client.totalJobs > 0 ? 'Active Customer' : 'Inactive',
    };
  });
}

// ============================================
// CSV 导出函数
// ============================================

/**
 * 生成推荐ID (与 Snapshot 一致)
 */
function generateReferralID(name, phone) {
  const initial = (name.charAt(0) || 'X').toUpperCase();
  const phoneDigits = (phone || '').replace(/\D/g, '').slice(-4) || '0000';
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${initial}${phoneDigits}${random}`;
}

/**
 * CSV转义(处理逗号、引号、换行)
 */
function escapeCSV(str) {
  if (str === null || str === undefined) return '""';
  str = String(str);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return '"' + str + '"';
}

/**
 * 将数据转换为 CSV 格式
 */
function convertToCSV(clients) {
  const headers = [
    'Company Name',
    'Contact Name',
    'Email',
    'Phone',
    'Address',
    'Type',
    'Category',
    'Priority',
    'Total Jobs',
    'Last Job Date',
    'Referral Link',
    'Notes',
  ];

  const rows = clients.map((client) => {
    const name = client.contactName || client.companyName || 'Unknown';
    const phone = (client.contactPhone || client.phone || '').replace(/\D/g, '');
    const referralID = generateReferralID(name, phone);
    const referralLink = `https://snapshot.betterhome.com.au/?ref=${referralID}`;

    return [
      escapeCSV(client.companyName),
      escapeCSV(client.contactName || ''),
      escapeCSV(client.contactEmail || client.email),
      escapeCSV(client.contactPhone || client.phone),
      escapeCSV(client.address),
      escapeCSV(client.type),
      escapeCSV(client.category),
      escapeCSV(client.priority),
      client.totalJobs,
      escapeCSV(client.lastJobDate || ''),
      escapeCSV(referralLink),
      escapeCSV(client.notes || ''),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * 保存 CSV 文件 (UTF-8 BOM 避免 Excel 中文乱码)
 */
function saveCSV(csvContent, filename) {
  fs.writeFileSync(filename, '\uFEFF' + csvContent, 'utf8');
  console.log(`   ✅ ${filename}`);
}

// ============================================
// 主函数
// ============================================

async function main() {
  console.log('🚀 开始从 ServiceM8 导出客户数据...\n');

  if (!API_KEY || API_KEY === 'YOUR_API_KEY_HERE') {
    console.error('❌ 错误: 请设置 ServiceM8 API Key!');
    console.error('\n方式1: 环境变量');
    console.error('   export SERVICEM8_API_KEY=你的API_Key');
    console.error('   node scripts/export_servicem8_contacts.js');
    console.error('\n方式2: 修改脚本');
    console.error('   编辑本文件，将 API_KEY 替换为你的 Key');
    console.error('\n💡 获取 API Key: ServiceM8 → Settings → API Keys → Generate\n');
    process.exit(1);
  }

  try {
    const companies = await fetchAllCompanies();
    const contacts = await fetchAllContacts();
    const jobs = await fetchCompletedJobs();

    if (companies.length === 0 && contacts.length === 0) {
      console.error('\n❌ 未获取到任何数据! 请检查:');
      console.error('   1. API Key 是否正确');
      console.error('   2. ServiceM8 账号是否有数据');
      console.error('   3. API Key 是否有读取权限\n');
      process.exit(1);
    }

    console.log('\n🔄 合并和处理数据...');
    let allClients = mergeData(companies, contacts, jobs);
    console.log(`   ✅ 合并后共 ${allClients.length} 条记录`);

    const validClients = filterValidClients(allClients);
    console.log(`   ✅ 筛选出 ${validClients.length} 个有效客户 (有邮箱或手机号)`);

    const categorizedClients = categorizeClients(validClients);
    const investmentClients = categorizedClients.filter((c) => c.category === 'Investment Property');
    console.log(`   ✅ 其中 ${investmentClients.length} 个投资房客户\n`);

    console.log('💾 生成 CSV 文件...');

    const allCSV = convertToCSV(categorizedClients);
    saveCSV(allCSV, 'servicem8_all_clients.csv');

    if (investmentClients.length > 0) {
      const investmentCSV = convertToCSV(investmentClients);
      saveCSV(investmentCSV, 'servicem8_investment_clients.csv');
    }

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const activeClients = categorizedClients.filter((c) => {
      return c.lastJobDate && new Date(c.lastJobDate) > oneYearAgo;
    });
    if (activeClients.length > 0) {
      const activeCSV = convertToCSV(activeClients);
      saveCSV(activeCSV, 'servicem8_active_clients.csv');
    }

    console.log('\n📊 导出统计:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`总客户数:          ${categorizedClients.length}`);
    console.log(`投资房客户:        ${investmentClients.length}`);
    console.log(`活跃客户(12个月):   ${activeClients.length}`);
    console.log(
      `有邮箱:            ${categorizedClients.filter((c) => c.email || c.contactEmail).length}`
    );
    console.log(
      `有手机号:          ${categorizedClients.filter((c) => c.phone || c.contactPhone).length}`
    );
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('✅ ServiceM8 客户数据已成功导出');
    console.log('\n📂 生成的文件 (位于当前目录):');
    console.log('   1. servicem8_all_clients.csv         (所有客户)');
    if (investmentClients.length > 0) {
      console.log('   2. servicem8_investment_clients.csv  (仅投资房)');
    }
    if (activeClients.length > 0) {
      console.log('   3. servicem8_active_clients.csv      (活跃客户)\n');
    }
  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    console.error('\n💡 常见问题:');
    console.error('   1. 检查 API Key (ServiceM8 使用 X-API-Key)');
    console.error('   2. 确认网络连接');
    console.error('   3. 文档: https://developer.servicem8.com/docs\n');
    process.exit(1);
  }
}

main();
