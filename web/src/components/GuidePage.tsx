import type { ReactNode } from 'react'
import { BookOpen, Boxes, Globe2, HardDrive, Network, Server, Upload } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import type { Page } from '../types'

interface Props {
  onGo: (page: Page) => void
  onStartAsset: () => void
}

function Step({ index, title, children }: { index: number; title: string; children: ReactNode }) {
  return (
    <li className="guide-step">
      <span className="guide-step-index" aria-hidden>{index}</span>
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </li>
  )
}

export function GuidePage({ onGo, onStartAsset }: Props) {
  return (
    <div className="guide-page">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BookOpen className="size-5" />第一次使用，从这里开始</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="guide-lead">
            dc-db 的台账由三块组成：<strong>资产</strong>（服务器、虚拟机、交换机）、<strong>位置</strong>（数据中心、机柜）、
            <strong>网络</strong>（VLAN、网段、IP）。三块可以按任意顺序录入，后面都能补。
          </p>
          <div className="guide-paths">
            <div className="guide-path">
              <HardDrive aria-hidden />
              <strong>我有机房和机柜</strong>
              <p>先建数据中心，再加机柜，然后把设备上架到 U 位。</p>
              <Button size="sm" onClick={() => onGo('facilities')}>去机柜</Button>
            </div>
            <div className="guide-path">
              <Server aria-hidden />
              <strong>我先把资产录进来</strong>
              <p>手工新增一台，或用 CSV 批量导入现有台账。</p>
              <Button size="sm" onClick={onStartAsset}>新增资产</Button>
            </div>
            <div className="guide-path">
              <Globe2 aria-hidden />
              <strong>我先规划网络</strong>
              <p>先建 VLAN，再划网段，最后分配 IP 地址。</p>
              <Button size="sm" onClick={() => onGo('subnets')}>去网络</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>资产怎么录</CardTitle></CardHeader>
        <CardContent>
          <ol className="guide-steps">
            <Step index={1} title="手工新增">在「服务器」、「虚拟机」或「网络设备」页点新增按钮，填名称、角色、负责人即可；CPU、内存、地址都可以留空。</Step>
            <Step index={2} title="CSV 批量导入">在资产页点「下载模板」，按列填好后点「导入 CSV」。导入前会显示预检结果和错误行，确认后才写入。</Step>
            <Step index={3} title="补充信息">扩展属性用来放各团队自定义的字段；标签用来做筛选和归类，需要先在「系统管理 → 标签管理」里建好。</Step>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>机房、机柜和上架</CardTitle></CardHeader>
        <CardContent>
          <ol className="guide-steps">
            <Step index={1} title="建数据中心">填写名称和网格大小，网格决定平面图能放多少个机柜。</Step>
            <Step index={2} title="加机柜">填机柜编号、区域/排、高度（U 数）和网格坐标，也可以直接在平面图里拖动摆放。</Step>
            <Step index={3} title="上架设备">打开机柜详情，在机柜图上点空的 U 位，选择已有资产或新建一台；设备块可以拖动调整 U 位。</Step>
            <Step index={4} title="出图">机柜图支持前视图/后视图切换，右上角可以把当前视图导出成 SVG 或 PNG。</Step>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>网络怎么管</CardTitle></CardHeader>
        <CardContent>
          <ol className="guide-steps">
            <Step index={1} title="建 VLAN">在「IPAM → VLAN」新建，VID 范围 1–4094。</Step>
            <Step index={2} title="划网段">在「网段与 IP」新增网段，填 CIDR 和网关，并选择所属 VLAN。</Step>
            <Step index={3} title="分配 IP">点空闲地址即可分配，填写用途、DNS 名称或关联资产；支持预留、VIP、loopback 等角色。</Step>
            <Step index={4} title="导出">网段、IP、VLAN 列表都能导出 CSV，导出的是当前筛选结果。</Step>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>接口和连线</CardTitle></CardHeader>
        <CardContent>
          <ol className="guide-steps">
            <Step index={1} title="加接口">打开资产详情 →「接口」页签 →「添加接口」，填名称（如 eth0、Gi0/1）、介质和速率。</Step>
            <Step index={2} title="连接">点「连接」，选择对端设备和它空闲的端口，确定后两端都会显示对端信息。</Step>
            <Step index={3} title="断开">在任意一端点「断开」即可解除，两端同时恢复未连接。</Step>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>常见问题</CardTitle></CardHeader>
        <CardContent>
          <div className="guide-faq">
            <details>
              <summary>默认账号和密码是什么？</summary>
              <p>管理员是 <code>admin</code> / <code>admin</code>，首次登录后请在「系统管理 → 更改密码」里修改；也可以直接在配置文件里设置初始密码。</p>
            </details>
            <details>
              <summary>为什么变更记录是空的？</summary>
              <p>变更记录只记录应用内的操作。用 SQL 直接导入的数据不会出现在这里；在界面上新增或修改任何内容后就会开始有记录。</p>
            </details>
            <details>
              <summary>数据存在哪，怎么备份？</summary>
              <p>数据在 PostgreSQL 里。用 <code>docker compose exec -T db pg_dump -U dc_db -Fc dc_db &gt; backup.dump</code> 备份，恢复用 <code>pg_restore</code>。</p>
            </details>
            <details>
              <summary>忘了管理员密码怎么办？</summary>
              <p>可以在数据库里删除该账号后重启服务，程序会按配置重新创建管理员；也可以在已知其他管理员的情况下用它重置。</p>
            </details>
            <details>
              <summary>能同时管多个机房吗？</summary>
              <p>可以。新建多个数据中心即可，每个数据中心有自己的机柜和平面图；机柜上的「区域/排」用来区分同一机房里的排。</p>
            </details>
            <details>
              <summary>导入 CSV 有什么限制？</summary>
              <p>单次最多 5000 行、16 MiB，整批事务写入：只要有一行校验失败，整批都不会写入。同名的资产或标签不存在都会导致失败。</p>
            </details>
          </div>
        </CardContent>
      </Card>

      <div className="guide-footer">
        <Space><Button variant="outline" onClick={() => onGo('facilities')}><Boxes className="size-4" />机柜</Button>
          <Button variant="outline" onClick={() => onGo('subnets')}><Network className="size-4" />网络</Button>
          <Button variant="outline" onClick={() => onGo('host')}><Upload className="size-4" />资产列表</Button></Space>
      </div>
    </div>
  )
}

function Space({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>
}
