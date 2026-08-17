const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database
const dbPath = path.join(__dirname, 'data', 'hangzhou2.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_name TEXT NOT NULL,
    platform TEXT NOT NULL,
    title TEXT NOT NULL,
    action TEXT NOT NULL,
    due_date TEXT NOT NULL,
    owner TEXT NOT NULL,
    collaborators TEXT DEFAULT '',
    estimated_cost INTEGER,
    actual_cost INTEGER,
    status TEXT DEFAULT 'pending',
    completed INTEGER DEFAULT 0,
    acceptance TEXT DEFAULT '',
    note TEXT DEFAULT '',
    sub_items TEXT DEFAULT NULL,
    updated_by TEXT DEFAULT '',
    updated_at TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS optional_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    platform TEXT NOT NULL,
    minimum_cost INTEGER NOT NULL,
    maximum_cost INTEGER NOT NULL,
    content TEXT NOT NULL,
    expected_effect TEXT NOT NULL,
    owner TEXT NOT NULL,
    selected INTEGER DEFAULT 0,
    actual_cost INTEGER,
    actual_result TEXT DEFAULT '',
    note TEXT DEFAULT '',
    updated_at TEXT DEFAULT ''
  );
`);

// Check if data is already seeded
const taskCount = db.prepare('SELECT COUNT(*) as count FROM tasks').get();
if (taskCount.count === 0) {
  console.log('Seeding database with initial data...');
  seedDatabase();
  console.log('Database seeded successfully.');
}

function seedDatabase() {
  const insertTask = db.prepare(`
    INSERT INTO tasks (group_name, platform, title, action, due_date, owner, collaborators, estimated_cost, acceptance)
    VALUES (@group_name, @platform, @title, @action, @due_date, @owner, @collaborators, @estimated_cost, @acceptance)
  `);

  const insertOptional = db.prepare(`
    INSERT INTO optional_items (type, title, platform, minimum_cost, maximum_cost, content, expected_effect, owner)
    VALUES (@type, @title, @platform, @minimum_cost, @maximum_cost, @content, @expected_effect, @owner)
  `);

  const tasks = [
    // ===== 项目统筹 =====
    { group_name: '项目统筹', platform: '全项目', title: '整体方案输出', action: '确认杭州开业基础方案、可选宣传项目及时间表', due_date: '7月25日', owner: '余兰', collaborators: '杨总、陈总、七七、鑫璇、林可欣', estimated_cost: 0, acceptance: '方案定稿' },
    { group_name: '项目统筹', platform: '全项目', title: '预算申请', action: '提交基础预算；待询价项目单独补充审批', due_date: '7月25日', owner: '余兰', collaborators: '林可欣、七七', estimated_cost: 0, acceptance: '预算审批完成' },
    { group_name: '项目统筹', platform: '全平台', title: '宣传图文定稿', action: '统一门店名称、地址、电话、活动和预约口径', due_date: '7月28日', owner: '余兰', collaborators: '林可欣、七七、鑫璇', estimated_cost: 0, acceptance: '全平台信息一致' },
    { group_name: '项目统筹', platform: '全项目', title: '活动落地执行', action: '跟进平台、内容、物料和开业现场', due_date: '7月25日—8月22日', owner: '余兰', collaborators: '林可欣、店长、七七', estimated_cost: 0, acceptance: '按节点完成' },
    { group_name: '项目统筹', platform: '全项目', title: '开业活动方案', action: '确认开业活动主题、优惠政策、活动形式、预约流程及现场动线', due_date: '7月28日', owner: '余兰', collaborators: '杨总、陈总、林可欣、七七', estimated_cost: 0, acceptance: '方案定稿' },
    { group_name: '项目统筹', platform: '全项目', title: '装修进度跟进', action: '跟进门店装修施工进度，确保硬装按时交付', due_date: '7月25日—8月10日', owner: '宇杰', collaborators: '陈总、区域经理', estimated_cost: 0, acceptance: '装修完工验收' },
    { group_name: '项目统筹', platform: '全项目', title: '营业执照办理', action: '办理杭州门店营业执照、税务登记及相关经营资质', due_date: '7月28日', owner: '余兰', collaborators: '林可欣、陈总、七七', estimated_cost: 0, acceptance: '证照齐全' },
    { group_name: '项目统筹', platform: '全项目', title: '门店手机配置', action: '配置门店专用手机，安装微信、小红书、抖音、点评等必要应用', due_date: '8月5日', owner: '区域经理', collaborators: '门店店长', estimated_cost: null, acceptance: '手机可用' },
    { group_name: '项目统筹', platform: '全项目', title: '门店手机卡办理', action: '办理杭州本地手机号，用于门店对外联系及各平台账号注册绑定', due_date: '8月5日', owner: '区域经理', collaborators: '门店店长', estimated_cost: null, acceptance: '号码激活可用' },

    // ===== 小红书运营组 =====
    { group_name: '小红书运营组', platform: '小红书达人', title: '基础达人矩阵', action: '约25位KOC/KOL，内容包含杭州新店、路线、服务和开业活动', due_date: '8月5日—8月20日', owner: '灵榕', collaborators: '七七、余兰', estimated_cost: 53000, acceptance: '内容上线并回收数据' },
    { group_name: '小红书运营组', platform: '小红书店号', title: '账号基础搭建', action: '蓝V认证、私信设置、绑定门店地址、主页装修和预约入口', due_date: '8月7日', owner: '曼芸', collaborators: '七七、林可欣、余兰', estimated_cost: 600, acceptance: '店号可搜索和预约' },
    { group_name: '小红书运营组', platform: '小红书店号', title: '基础内容发布', action: '1条预热、1条环境、1条活动预热、1条开业活动、4条产品、1条路线、1条服务+产品硬广置顶，约10条', due_date: '7月31日—8月15日', owner: '曼芸', collaborators: '七七、林可欣、余兰', estimated_cost: 0, acceptance: '完成基础内容发布' },

    { group_name: '小红书运营组', platform: '小红书店号', title: '聚光投放', action: '优先投放收藏、咨询表现较好的笔记', due_date: '8月11日起', owner: '曼芸', collaborators: '七七、余兰', estimated_cost: 15000, acceptance: '获得曝光、咨询和预约' },
    { group_name: '小红书运营组', platform: '小红书总号', title: '总号内容与信息更新', action: '发布1条预热和1条正式开业内容；后台增加杭州店信息', due_date: '8月5日—8月15日', owner: '七七', collaborators: '林可欣、余兰', estimated_cost: 0, acceptance: '总号完成新店露出' },
    { group_name: '小红书运营组', platform: '小红书/点评/抖音', title: 'KOC到店打卡', action: '到店发布内容及真实评价；赠礼成本按实际数量另计', due_date: '开业后启动', owner: '门店同事', collaborators: '灵榕、门店同事、七七、余兰', estimated_cost: 0, acceptance: '形成首批口碑' },

    // ===== 抖音及视频号组 =====
    { group_name: '抖音及视频号组', platform: '抖音店号', title: '基础视频发布', action: '门店装修阶段预热系列、商圈1条、环境1条、产品/服务4条、路线1条、开业1条，约10条', due_date: '7月31日—8月15日', owner: '鑫璇', collaborators: '微微、林可欣', estimated_cost: 0, acceptance: '完成基础视频发布' },
    { group_name: '抖音及视频号组', platform: '抖音店号', title: '门店装修阶段预热', action: '拍摄装修进度、空间剧透、团队筹备等内容进行开业前预热', due_date: '7月31日起', owner: '鑫璇', collaborators: '林可欣、门店同事', estimated_cost: 0, acceptance: '开业前形成用户期待和预约意向' },
    { group_name: '抖音及视频号组', platform: '抖音店号', title: '蓝V认证及本地推', action: '完成认证并启动基础本地推', due_date: '8月11日起', owner: '鑫璇', collaborators: '余兰、门店同事、七七', estimated_cost: 3500, acceptance: '获得本地曝光和咨询' },
    { group_name: '抖音及视频号组', platform: '抖音来客', title: '团购与核销配置', action: '认领、团购、子账号、核销和数据追踪', due_date: '8月10日', owner: '微微', collaborators: '门店同事', estimated_cost: 0, acceptance: '团购可展示并核销' },
    { group_name: '抖音及视频号组', platform: '视频号店号', title: '视频号内容', action: '门店装修阶段预热适配版、团队、服务、开业和顾客反馈，约5—7条', due_date: '8月1日—8月22日', owner: '鑫璇', collaborators: '微微、门店同事', estimated_cost: 0, acceptance: '老客传播和企微预约' },
    { group_name: '抖音及视频号组', platform: '抖音/视频号总号', title: '总号同步', action: '同步预热及正式开业重点内容；增加杭州店信息', due_date: '8月5日—8月15日', owner: '微微', collaborators: '林可欣', estimated_cost: 0, acceptance: '总号完成新店露出' },

    // ===== 点评与地图组 =====
    { group_name: '点评与地图组', platform: '大众点评/美团', title: '店铺基础搭建', action: '认领、装修、团购、私信、问答及门店子账号', due_date: '8月10日', owner: '钰宜', collaborators: '余兰、门店同事、七七', estimated_cost: 0, acceptance: '店铺完整可咨询' },
    { group_name: '点评与地图组', platform: '大众点评/美团', title: '付费推广', action: '评分达到投放条件后启动搜索推广', due_date: '8月16日起', owner: '余兰', collaborators: '钰宜、门店同事、七七', estimated_cost: 12000, acceptance: '获得搜索曝光和咨询' },
    { group_name: '点评与地图组', platform: '大众点评/美团', title: '星级维护', action: '开业30天内积累真实评价并持续回复', due_date: '8月16日—9月14日', owner: '门店同事', collaborators: '余兰、门店同事、七七', estimated_cost: 0, acceptance: '形成稳定口碑' },
    { group_name: '点评与地图组', platform: '大众点评/美团', title: '门店蓝V及内容', action: '同步门店环境、服务、套餐和路线内容', due_date: '8月10日', owner: '门店同事', collaborators: '余兰、钰宜、七七', estimated_cost: 0, acceptance: '店铺内容完整' },
    { group_name: '点评与地图组', platform: '高德地图', title: '地图搭建及商户通', action: '位置、电话、营业时间、图片、路线和商户通', due_date: '8月10日', owner: '钰宜', collaborators: '余兰、门店同事、七七', estimated_cost: 3000, acceptance: '位置准确可导航' },
    { group_name: '点评与地图组', platform: '百度/腾讯地图', title: '位置标注', action: '位置、电话、营业时间和路线信息', due_date: '8月10日', owner: '钰宜', collaborators: '余兰、门店同事、七七', estimated_cost: 0, acceptance: '两个平台准确可导航' },

    // ===== 线下活动及私域组 =====
    { group_name: '线下活动及私域组', platform: '线下活动', title: '基础开业活动', action: '门店氛围、简单接待、预约核销和现场执行', due_date: '8月15日', owner: '林可欣', collaborators: '店长、门店同事、陈总', estimated_cost: 3000, acceptance: '现场有序完成' },
    { group_name: '线下活动及私域组', platform: '线下活动', title: '花艺装扮', action: '桌花、花篮及门店氛围布置', due_date: '8月14日', owner: '林可欣', collaborators: '店长、陈总', estimated_cost: 2000, acceptance: '花艺按时到场' },
    { group_name: '线下活动及私域组', platform: '线下活动', title: '开业拍摄', action: '视频和图片；现场实时出片并交付精修及原素材', due_date: '8月15日', owner: '林可欣', collaborators: '余兰、门店同事、七七', estimated_cost: 6000, acceptance: '完整开业素材' },
    { group_name: '线下活动及私域组', platform: '线下活动', title: '基础伴手礼', action: '按预约及重点客户名单准备基础礼赠', due_date: '8月14日', owner: '林可欣', collaborators: '店长、门店同事、陈总', estimated_cost: 3000, acceptance: '数量及名单核对' },
    { group_name: '线下活动及私域组', platform: '微信公众号', title: '开业推文', action: '预热推文1篇、正式开业推文1篇，包含路线和预约入口', due_date: '8月5日—8月15日', owner: '曼芸', collaborators: '七七、余兰', estimated_cost: 0, acceptance: '完成2篇推文' },
    { group_name: '线下活动及私域组', platform: '企微/朋友圈', title: '老客邀约', action: '老店同步回访目标客户；发布预热、活动、倒计时和开业回顾', due_date: '8月5日—8月22日', owner: '门店同事', collaborators: '林可欣、门店同事', estimated_cost: 0, acceptance: '获得有效预约' },

    // ===== 物料组 =====
    { group_name: '物料组', platform: '线下物料', title: '电梯口指引牌', action: '提供尺寸、设计定稿、制作并在门店展出', due_date: '8月12日', owner: '林可欣', collaborators: '店长、陈总', estimated_cost: 30, acceptance: '完成到店指引' },
    { group_name: '物料组', platform: '线下物料', title: '开业活动水牌', action: '展示活动内容、预约方式及注意事项', due_date: '8月12日', owner: '林可欣', collaborators: '店长、陈总', estimated_cost: 30, acceptance: '现场展示' },
    { group_name: '物料组', platform: '线下物料', title: 'KOC打卡水牌', action: '展示打卡规则、内容要求和赠礼说明', due_date: '8月12日', owner: '林可欣', collaborators: '店长、灵榕、陈总', estimated_cost: 30, acceptance: '现场展示' },
    { group_name: '物料组', platform: '线上物料', title: '开业及路线海报', action: '制作杭州店各平台适配版本海报；全国门店转发开业公众号链接；杭州店小红书版本已纳入基础内容发布', due_date: '8月12日', owner: '林可欣', collaborators: '曼芸、七七、鑫璇、微微', estimated_cost: 0, acceptance: '全部版本定稿' },

    // ===== 复盘 =====
    { group_name: '复盘', platform: '全平台', title: '开业7天复盘', action: '汇总费用、曝光、咨询、预约、到店和成交', due_date: '8月22日', owner: '余兰', collaborators: '七七、灵榕、曼芸、鑫璇、微微、钰宜、林可欣', estimated_cost: 0, acceptance: '形成7天复盘' },
    { group_name: '复盘', platform: '全平台', title: '开业30天复盘', action: '判断继续、优化或停止的项目', due_date: '9月14日', owner: '余兰', collaborators: '七七、灵榕、曼芸、鑫璇、微微、钰宜、林可欣', estimated_cost: 0, acceptance: '形成30天复盘' },
  ];

  const optionalItems = [
    { type: '达人追加', title: '小红书达人补充10位', platform: '小红书', minimum_cost: 4000, maximum_cost: 8000, content: '前期数据较好时追加本地KOC', expected_effect: '增加约8万—20万曝光', owner: '灵榕' },
    { type: '内容升级', title: '专业短视频系列升级', platform: '抖音/视频号', minimum_cost: 12000, maximum_cost: 30000, content: '增加脚本、出镜、专业拍摄和剪辑', expected_effect: '增加约15万—35万曝光及咨询', owner: '鑫璇' },
    { type: '追加投放', title: '小红书聚光追加', platform: '小红书', minimum_cost: 10000, maximum_cost: 50000, content: '对高收藏、高咨询笔记追加投放', expected_effect: '增加曝光、咨询和预约', owner: '曼芸' },
    { type: '追加投放', title: '抖音本地推追加', platform: '抖音', minimum_cost: 10000, maximum_cost: 50000, content: '对高互动、高私信视频追加投放', expected_effect: '增加本地曝光、咨询和预约', owner: '鑫璇' },
    { type: '直播', title: '探店或开业直播', platform: '抖音/视频号', minimum_cost: 8000, maximum_cost: 25000, content: '探店直播、开业直播及直播预约权益', expected_effect: '增加观看、咨询和预约', owner: '鑫璇、微微' },
    { type: '楼宇媒体', title: '写字楼电梯广告', platform: '线下媒体', minimum_cost: 21000, maximum_cost: 35000, content: '按杭州写字楼点位、上刊周期和数量询价', expected_effect: '增强楼宇及周边人群认知', owner: '林可欣' },
    { type: '城市媒体', title: '杭州本地媒体/生活方式账号', platform: '本地媒体', minimum_cost: 10000, maximum_cost: 40000, content: '3—8个杭州本地账号发布', expected_effect: '增加城市曝光和搜索', owner: '七七' },
    { type: '客户活动', title: 'VIP私享会/下午茶', platform: '线下/私域', minimum_cost: 12000, maximum_cost: 35000, content: '邀请重点客户进行品牌或产品私享活动', expected_effect: '增加到店和成交', owner: '林可欣' },
    { type: '品牌活动', title: '品牌主题展或产品品鉴', platform: '线下/全平台', minimum_cost: 25000, maximum_cost: 80000, content: '主题展陈、产品、活动及线上传播', expected_effect: '增加声量、到店和成交', owner: '余兰、林可欣' },
    { type: '异业合作', title: '咖啡/牙科/医美/企业联名', platform: '异业/私域', minimum_cost: 8000, maximum_cost: 30000, content: '联合权益、客户邀约及活动内容', expected_effect: '增加预约和成交', owner: '店长、余兰' },
    { type: '企业获客', title: '写字楼企业客户专场', platform: '企微/线下', minimum_cost: 10000, maximum_cost: 30000, content: '企业验光、选镜或员工福利专场', expected_effect: '增加企业预约和成交', owner: '店长、余兰' },
    { type: '礼赠升级', title: '开业礼赠升级', platform: '线下/私域', minimum_cost: 8000, maximum_cost: 30000, content: '提升重点客户和转介绍礼赠', expected_effect: '提升到店、成交和转介绍', owner: '林可欣' },
    { type: '体验招募', title: '试营业体验官', platform: '全平台', minimum_cost: 6000, maximum_cost: 20000, content: '招募10—30人试营业体验并产出反馈', expected_effect: '增加口碑和预约', owner: '曼芸、门店同事' },
    { type: '持续传播', title: '开业后30天种草维护', platform: '全平台', minimum_cost: 15000, maximum_cost: 45000, content: '内容、达人、点评和顾客案例持续维护', expected_effect: '维持曝光、口碑和预约', owner: '七七、灵榕、曼芸' },
  ];

  const seedAll = db.transaction(() => {
    for (const t of tasks) {
      insertTask.run(t);
    }
    for (const o of optionalItems) {
      insertOptional.run(o);
    }
  });

  seedAll();
}

// ===== API Routes =====

// Get all tasks
app.get('/api/tasks', (req, res) => {
  const tasks = db.prepare('SELECT * FROM tasks ORDER BY id').all();
  res.json(tasks);
});

// Update a task (partial update)
app.put('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const allowedFields = ['completed', 'actual_cost', 'note', 'status', 'updated_by'];
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }
  updates.updated_at = new Date().toISOString();

  const setClauses = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
  const stmt = db.prepare(`UPDATE tasks SET ${setClauses} WHERE id = @id`);
  stmt.run({ ...updates, id: parseInt(id) });

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(parseInt(id));
  res.json(task);
});

// Update a sub-item within a task
app.put('/api/tasks/:taskId/sub-items/:subId', (req, res) => {
  const { taskId, subId } = req.params;
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(parseInt(taskId));
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (!task.sub_items) return res.status(400).json({ error: 'Task has no sub-items' });

  const subItems = JSON.parse(task.sub_items);
  const sub = subItems.find(s => s.id === parseInt(subId));
  if (!sub) return res.status(404).json({ error: 'Sub-item not found' });

  sub.completed = req.body.completed ? 1 : 0;

  // Check if all sub-items are complete
  const allDone = subItems.every(s => s.completed === 1);
  const completed = allDone ? 1 : 0;

  db.prepare('UPDATE tasks SET sub_items = ?, completed = ?, updated_at = ?, updated_by = ? WHERE id = ?')
    .run(JSON.stringify(subItems), completed, new Date().toISOString(), req.body.updated_by || '协作者', parseInt(taskId));

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(parseInt(taskId));
  res.json(updated);
});

// Get all optional items
app.get('/api/optional-items', (req, res) => {
  const items = db.prepare('SELECT * FROM optional_items ORDER BY id').all();
  res.json(items);
});

// Update an optional item
app.put('/api/optional-items/:id', (req, res) => {
  const { id } = req.params;
  const allowedFields = ['selected', 'actual_cost', 'actual_result', 'note'];
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }
  updates.updated_at = new Date().toISOString();

  const setClauses = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
  const stmt = db.prepare(`UPDATE optional_items SET ${setClauses} WHERE id = @id`);
  stmt.run({ ...updates, id: parseInt(id) });

  const item = db.prepare('SELECT * FROM optional_items WHERE id = ?').get(parseInt(id));
  res.json(item);
});

// Get summary stats
app.get('/api/stats', (req, res) => {
  const totalTasks = db.prepare('SELECT COUNT(*) as count FROM tasks').get().count;
  const completedTasks = db.prepare('SELECT COUNT(*) as count FROM tasks WHERE completed = 1').get().count;
  
  const groupStats = db.prepare(`
    SELECT group_name, COUNT(*) as total, SUM(completed) as completed
    FROM tasks GROUP BY group_name ORDER BY MIN(id)
  `).all();

  const optionalStats = db.prepare(`
    SELECT COUNT(*) as total, SUM(selected) as selected,
           SUM(CASE WHEN selected = 1 THEN minimum_cost ELSE 0 END) as min_total,
           SUM(CASE WHEN selected = 1 THEN maximum_cost ELSE 0 END) as max_total
    FROM optional_items
  `).get();

  // Calculate base known cost (sum of non-null estimated costs)
  const baseCostResult = db.prepare('SELECT SUM(estimated_cost) as total FROM tasks WHERE estimated_cost IS NOT NULL').get();

  res.json({
    totalTasks,
    completedTasks,
    pendingTasks: totalTasks - completedTasks,
    completionPercent: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    baseKnownCost: baseCostResult.total || 0,
    groupStats,
    optionalStats,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
