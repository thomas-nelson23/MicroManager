# Nextion component reference (extracted from Nextion Editor 1.68.2)

Every component also has the common attributes `objname`, `vscope`, `x`, `y`, `w`, `h`.
Descriptions are the editor's original Chinese strings. `~cond` at the end means the attribute only applies when that condition holds (e.g. `~sta=1`).
Some attributes differ by series (Basic / Enhanced / Intelligent); this lists the first definition found.

| objtype | label | name prefix | events |
|---|---|---|---|
| 121 | page (`page`) | page | load, loadend, down, up, unload |
| 116 | text (`text`) | t | down, up |
| 98 | button (`button`) | b | down, up |
| 54 | number (`number`) | n | down, up |
| 59 | float number (`xfloat`) | x | down, up |
| 106 | progress bar (`prog`) | j | down, up |
| 112 | picture (`pic`) | p | down, up |
| 113 | crop (`picc`) | q | down, up |
| 109 | hotspot (`touch`) | m | down, up |
| 51 | timer (`timer`) | tm | timer |
| 52 | variable (`vari`) | va | - |
| 53 | dual-state button (`button_t`) | bt | down, up |
| 56 | checkbox (`checkbox`) | c | down, up |
| 57 | radiobutton (`radiobutton`) | r | down, up |
| 1 | slider (`OBJECT_TYPE_SLIDER`) | h | down, up, slide |
| 122 | gauge (`zhizhen`) | z | down, up |
| 0 | waveform (`OBJECT_TYPE_CURVE`) | s | down, up |
| 58 | qrcode (`qrcode`) | qr | down, up |
| 62 | scrolling text (`SLText`) | slt | down, up |
| 67 | switchbutton (`switchbutton`) | sw | down, up |
| 61 | combobox (`combobox`) | cb | down, up |
| 68 | text select (`TextSelect`) | select | down, up |
| 55 | gtext (rich text) (`gtext`) | g | down, up |
| 2 | gmov (`gmov`) | gm | down, up, playend |
| 3 | avi (`avi`) | v | down, up, playend |
| 4 | wav (`wav`) | wav | playend |
| 5 | Touchcap (`Touchcap`) | tc | down, up |
| 60 | expic (`expic`) | exp | down, up |
| 63 | filestream (`filestream`) | fs | - |
| 64 | filedirectory (`filedirectory`) | fd | - |
| 65 | filebrowser (`filebrowser`) | fbrowser | down, up |
| 66 | datarecord (`datarecord`) | data | down, up |
| 69 | Printer3D (`Printer3D`) | pr | down, up |
| 70 | ColPic (`ColPic`) | cp | down, up |
| 110 | TouchUpVP (`TouchUpVP`) | tu | down, up |
| 125 | inputTxt_VP (`inputTxt_VP`) | VPint | down, up |
| 126 | input_VP (`input_VP`) | VPin | down, up |
| 127 | yfloat_VP (`yfloat_VP`) | VPy | down, up |
| 128 | text_VP (`text_VP`) | VPt | down, up |
| 129 | xfloat_VP (`xfloat_VP`) | VPx | down, up |
| 130 | prog_VP (`prog_VP`) | VPj | down, up |
| 131 | pic_VP (`pic_VP`) | VPp | down, up |
| 132 | button_VP (`button_VP`) | VPb | down, up, touchs |
| 133 | qrcode_VP (`qrcode_VP`) | VPqr | down, up |
| 134 | TouchMS_VP (`TouchMS_VP`) | VPtms | down, up |
| 135 | TouchMenu_VP (`TouchMenu_VP`) | VPtne | down, up |
| 136 | Movepic_VP (`Movepic_VP`) | VPmp | down, up |
| 137 | Curve_VP (`Curve_VP`) | VPqc | down, up |
| 138 | JPEG_VP (`JPEG_VP`) | VPjpg | down, up |
| 139 | Dra_VP (`Dra_VP`) | VPdra | Ref |
| 254 | nu (`nu`) | nu | - |

## page (objtype 121, prefix `page`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `up` | UU8 | 255 | 0..255 | yes | 上滑翻页页面ID(255为无滑动翻页) |
| `down` | UU8 | 255 | 0..255 | yes | 下滑翻页页面ID(255为无滑动翻页) |
| `left` | UU8 | 255 | 0..255 | yes | 左滑翻页页面ID(255为无滑动翻页) |
| `right` | UU8 | 255 | 0..255 | yes | 右滑翻页页面ID(255为无滑动翻页) |
| `sta` | Select | 1 | 0..2 | no | 背景填充方式:0-无背景;1-单色;2-图片 |
| `bco` | Color | 65535 | 0..65535 | yes | 背景色~sta=1 |
| `pic` | Picid | 65535 | 0..65535 | yes | 背景图片(必须是全屏图片)~sta=2 |

## text (objtype 116, prefix `t`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `sta` | Select | 1 | 0..3 | no | 背景填充方式:0-切图;1-单色;2-图片;3-透明 |
| `style` | Select | 0 | 0..3 | no | 显示风格:0-平面;1-边框;2-3D_Down;3-3D_Up~sta=1 |
| `key` | key | 255 | 0..255 | no | 绑定键盘 |
| `borderc` | Color | 0 | 0..65535 | yes | 边框颜色~style=1 |
| `borderw` | UU8 | 2 | 0..255 | yes | 边框粗细,最大值:255~style=1 |
| `font` | Fontid | 0 | 0..255 | yes | 字库 |
| `bco` | Color | 65535 | 0..65535 | yes | 背景色~sta=1 |
| `picc` | Picid | 65535 | 0..65535 | yes | 背景切图图片(必须是全屏图片)~sta=0 |
| `pic` | Picid | 65535 | 0..65535 | yes | 背景图片~sta=2 |
| `pco` | Color | 0 | 0..65535 | yes | 字体色 |
| `xcen` | Select | 1 | 0..2 | yes | 水平对齐:0-靠左;1-居中;2-靠右 |
| `ycen` | Select | 1 | 0..2 | yes | 垂直对齐:0-靠上;1-居中;2-靠下 |
| `pw` | Select | 0 | 0..1 | yes | 是否显示为密码(内容仍为实际内容,仅仅显示出来为*):0-否;1-是 |
| `txt` | Sstr | newtxt | 0..int.MaxValue | yes | 字符内容 |
| `txt_maxl` | Strlenth | 10 | 0..65534 | no | 字符最大长度(即分配内存空间) |
| `isbr` | Select | 0 | 0..1 | yes | 是否自动换行:0-否;1-是 |
| `spax` | UU8 | 0 | 0..255 | yes | 字符横向间距(最小0,最大255) |
| `spay` | UU8 | 0 | 0..255 | yes | 字符纵向间距(最小0,最大255) |

## button (objtype 98, prefix `b`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `sta` | Select | 1 | 0..3 | no | 背景填充方式:0-切图;1-单色;2-图片;3-透明 |
| `style` | Select | 4 | 0..4 | no | 显示风格:0-平面;1-边框;2-3D_Down;3-3D_Up;4-3D_Auto~sta=1 |
| `borderc` | Color | 0 | 0..65535 | yes | 边框颜色~style=1 |
| `borderw` | UU8 | 2 | 0..255 | yes | 边框粗细,最大值:255~style=1 |
| `font` | Fontid | 0 | 0..255 | yes | 字库 |
| `pic` | Picid | 65535 | 0..65535 | yes | 默认背景图片~sta=2 |
| `picc` | Picid | 65535 | 0..65535 | yes | 默认切图背景(必须是全屏图片)~sta=0 |
| `bco` | Color | 50712 | 0..65535 | yes | 默认背景色~sta=1 |
| `pic2` | Picid | 65535 | 0..65535 | yes | 按下背景图片~sta=2 |
| `picc2` | Picid | 65535 | 0..65535 | yes | 按下切图背景(必须是全屏图片)~sta=0 |
| `bco2` | Color | 1024 | 0..65535 | yes | 按下背景色~sta=1 |
| `pco` | Color | 0 | 0..65535 | yes | 默认字体色 |
| `pco2` | Color | 65535 | 0..65535 | yes | 按下字体色 |
| `xcen` | Select | 1 | 0..2 | yes | 水平对齐:0-靠左;1-居中;2-靠右 |
| `ycen` | Select | 1 | 0..2 | yes | 垂直对齐:0-靠上;1-居中;2-靠下 |
| `txt` | 10 | newtxt | 0..255 | yes | 字符内容 |
| `txt_maxl` | Strlenth | 10 | 0..65534 | no | 字符最大长度(即分配内存空间) |
| `isbr` | Select | 0 | 0..1 | yes | 是否自动换行:0-否;1-是 |
| `spax` | UU8 | 0 | 0..255 | yes | 字符横向间距(最小0,最大255) |
| `spay` | UU8 | 0 | 0..255 | yes | 字符纵向间距(最小0,最大255) |

## number (objtype 54, prefix `n`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `sta` | Select | 1 | 0..3 | no | 背景填充方式:0-切图;1-单色;2-图片;3-透明 |
| `style` | Select | 0 | 0..3 | no | 显示风格:0-平面;1-边框;2-3D_Down;3-3D_Up~sta=1 |
| `key` | key | 255 | 0..255 | no | 绑定键盘 |
| `borderc` | Color | 0 | 0..65535 | yes | 边框颜色~style=1 |
| `borderw` | UU8 | 2 | 0..255 | yes | 边框粗细,最大值:255~style=1 |
| `font` | Fontid | 0 | 0..255 | yes | 字库 |
| `bco` | Color | 65535 | 0..65535 | yes | 背景色~sta=1 |
| `picc` | Picid | 65535 | 0..65535 | yes | 背景切图图片(必须是全屏图片)~sta=0 |
| `pic` | Picid | 65535 | 0..65535 | yes | 背景图片~sta=2 |
| `pco` | Color | 0 | 0..65535 | yes | 字体色 |
| `xcen` | Select | 1 | 0..2 | yes | 水平对齐:0-靠左;1-居中;2-靠右 |
| `ycen` | Select | 1 | 0..2 | yes | 垂直对齐:0-靠上;1-居中;2-靠下 |
| `val` | SS32 | 0 | int.MinValue..int.MaxValue | yes | 初始值(最小-2147483648,最大2147483647) |
| `lenth` | UU8 | 0 | 0..15 | yes | 显示位数(0为自动,最大15位) |
| `format` | Select | 0 | 0..2 | yes | 格式化类型:0-数字;1-货币;2-Hex |
| `isbr` | Select | 1 | 0..1 | yes | 是否自动换行:0-否;1-是 |
| `spax` | UU8 | 0 | 0..255 | yes | 字符横向间距(最小0,最大255) |
| `spay` | UU8 | 0 | 0..255 | yes | 字符纵向间距(最小0,最大255) |

## float number (objtype 59, prefix `x`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `sta` | Select | 1 | 0..3 | no | 背景填充方式:0-切图;1-单色;2-图片;3-透明 |
| `style` | Select | 0 | 0..3 | no | 显示风格:0-平面;1-边框;2-3D_Down;3-3D_Up~sta=1 |
| `key` | key | 255 | 0..255 | no | 绑定键盘 |
| `borderc` | Color | 0 | 0..65535 | yes | 边框颜色~style=1 |
| `borderw` | UU8 | 2 | 0..255 | yes | 边框粗细,最大值:255~style=1 |
| `font` | Fontid | 0 | 0..255 | yes | 字库 |
| `bco` | Color | 65535 | 0..65535 | yes | 背景色~sta=1 |
| `picc` | Picid | 65535 | 0..65535 | yes | 背景切图图片(必须是全屏图片)~sta=0 |
| `pic` | Picid | 65535 | 0..65535 | yes | 背景图片~sta=2 |
| `pco` | Color | 0 | 0..65535 | yes | 字体色 |
| `xcen` | Select | 1 | 0..2 | yes | 水平对齐:0-靠左;1-居中;2-靠右 |
| `ycen` | Select | 1 | 0..2 | yes | 垂直对齐:0-靠上;1-居中;2-靠下 |
| `val` | SS32 | 0 | int.MinValue..int.MaxValue | yes | 初始值(最小-2147483648,最大2147483647) |
| `vvs0` | UU8 | 0 | 0..10 | yes | 整数位数(0为自动,最大10位) |
| `vvs1` | UU8 | 0 | 0..8 | yes | 小数位数(0为无小数,最大8位) |
| `isbr` | Select | 1 | 0..1 | yes | 是否自动换行:0-否;1-是 |
| `spax` | UU8 | 0 | 0..255 | yes | 字符横向间距(最小0,最大255) |
| `spay` | UU8 | 0 | 0..255 | yes | 字符纵向间距(最小0,最大255) |

## progress bar (objtype 106, prefix `j`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `sta` | Select | 0 | 0..1 | no | 填充方式:0-单色;1-图片 |
| `dez` | Select | 0 | 0..1 | no | 进度方式:0-横向;1-竖向 |
| `val` | UU8 | 50 | 0..100 | yes | 进度值 |
| `dis` | UU8 | 25 | 0..100 | yes | 外形圆角半径百分比(0-100,0为直角)~sta=0 |
| `bco` | Color | 48631 | 0..65535 | yes | 背景色~sta=0 |
| `bpic` | Picid | 65535 | 0..65535 | yes | 背景图片~sta=1 |
| `pco` | Color | 1024 | 0..65535 | yes | 前景色~sta=0 |
| `ppic` | Picid | 65535 | 0..65535 | yes | 前景图片~sta=1 |

## picture (objtype 112, prefix `p`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `pic` | Picid | 65535 | 0..65535 | yes | 图片 |

## crop (objtype 113, prefix `q`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `picc` | Picid | 65535 | 0..65535 | yes | 切图图片(必须是全屏图片) |
| `vvs0` | SS16 | 0 | int.MinValue..int.MaxValue | yes | 切图偏移x |
| `vvs1` | SS16 | 0 | int.MinValue..int.MaxValue | yes | 切图偏移y |

## timer (objtype 51, prefix `tm`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `tim` | UU16 | 400 | 50..65534 | yes | 定时时间,单位:ms(最小50,最大65534) |
| `en` | UU8 | 1 | 0..1 | yes | 使能开关:0为关闭,1为开启 |

## variable (objtype 52, prefix `va`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `sta` | Select | 0 | 0..1 | no | 数据类型:0-数值;1-字符串 |
| `txt` | 10 | newtxt | 0..255 | yes | 初始字符内容~sta=1 |
| `txt_maxl` | Strlenth | 10 | 0..65534 | no | 字符最大长度(即分配内存空间)~sta=1 |
| `val` | SS32 | 0 | int.MinValue..int.MaxValue | yes | 初始值(最小-2147483648,最大2147483647)~sta=0 |

## dual-state button (objtype 53, prefix `bt`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `sta` | Select | 1 | 0..3 | no | 背景填充方式:0-切图;1-单色;2-图片;3-透明 |
| `style` | Select | 4 | 0..4 | no | 显示风格:0-平面;1-边框;2-3D_Down;3-3D_Up;4-3D_Auto~sta=1 |
| `borderc` | Color | 0 | 0..65535 | yes | 边框颜色~style=1 |
| `borderw` | UU8 | 2 | 0..255 | yes | 边框粗细,最大值:255~style=1 |
| `font` | Fontid | 0 | 0..255 | yes | 字库 |
| `pic` | Picid | 65535 | 0..65535 | yes | 默认背景图片~sta=2 |
| `picc` | Picid | 65535 | 0..65535 | yes | 默认切图背景(必须是全屏图片)~sta=0 |
| `bco` | Color | 50712 | 0..65535 | yes | 默认背景色~sta=1 |
| `pic2` | Picid | 65535 | 0..65535 | yes | 按下背景图片~sta=2 |
| `picc2` | Picid | 65535 | 0..65535 | yes | 按下切图背景(必须是全屏图片)~sta=0 |
| `bco2` | Color | 1024 | 0..65535 | yes | 按下背景色~sta=1 |
| `pco` | Color | 0 | 0..65535 | yes | 默认字体色 |
| `pco2` | Color | 65535 | 0..65535 | yes | 按下字体色 |
| `xcen` | Select | 1 | 0..2 | yes | 水平对齐:0-靠左;1-居中;2-靠右 |
| `ycen` | Select | 1 | 0..2 | yes | 垂直对齐:0-靠上;1-居中;2-靠下 |
| `val` | UU8 | 0 | 0..1 | yes | 当前状态(0或1) |
| `txt` | Sstr | newtxt | 0..255 | yes | 字符内容 |
| `txt_maxl` | Strlenth | 10 | 0..65534 | no | 字符最大长度(即分配内存空间) |
| `isbr` | Select | 0 | 0..1 | yes | 是否自动换行:0-否;1-是 |
| `spax` | UU8 | 0 | 0..255 | yes | 字符横向间距(最小0,最大255) |
| `spay` | UU8 | 0 | 0..255 | yes | 字符纵向间距(最小0,最大255) |

## checkbox (objtype 56, prefix `c`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `style` | Select | 2 | 0..3 | no | 显示风格:0-平面;1-边框;2-3D_Down;3-3D_Up |
| `borderw` | UU8 | 2 | 0..255 | yes | 边框粗细,最大值:255~style=1 |
| `borderc` | Color | 0 | 0..65535 | yes | 边框颜色~style=1 |
| `bco` | Color | 65535 | 0..65535 | yes | 背景色 |
| `pco` | Color | 0 | 0..65535 | yes | 前景色 |
| `val` | UU8 | 1 | 0..1 | yes | 当前状态(0或1) |

## radiobutton (objtype 57, prefix `r`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `bco` | Color | 65535 | 0..65535 | yes | 背景色 |
| `pco` | Color | 0 | 0..65535 | yes | 前景色 |
| `val` | UU8 | 1 | 0..1 | yes | 当前状态(0或1) |

## slider (objtype 1, prefix `h`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `mode` | Select | 0 | 0..1 | no | 滑行方向:0-横向;1-竖向 |
| `sta` | Select | 1 | 0..2 | no | 背景填充方式:0-切图;1-单色;2-图片 |
| `psta` | Select | 0 | 0..2 | no | 游标填充方式:0-单色圆形;1-图片;2-单色四边形 |
| `wid` | UU8 | 255 | 0..255 | yes | 游标宽度(255为自动，0为无游标) |
| `hig` | UU8 | 255 | 0..255 | yes | 游标高度(255为自动，0为无游标) |
| `dis` | UU8 | 100 | 0..100 | yes | 外形圆角半径百分比(0-100,0为直角)~sta=1 |
| `pic` | Picid | 65535 | 0..65535 | yes | 背景图片~sta=2 |
| `picc` | Picid | 65535 | 0..65535 | yes | 背景切图图片(必须是全屏图片)~sta=0 |
| `bco` | Color | 1024 | 0..65535 | yes | 背景色~sta=1 |
| `pic1` | Picid | 65535 | 0..65535 | yes | 前景图片~sta=2 |
| `picc1` | Picid | 65535 | 0..65535 | yes | 前景切图图片(必须是全屏图片)~sta=0 |
| `bco1` | Color | 64235 | 0..65535 | yes | 前景色~sta=1 |
| `pic2` | Picid | 65535 | 0..65535 | yes | 游标图片~psta=1 |
| `pco` | Color | 16384 | 0..65535 | yes | 游标颜色~psta!1 |
| `val` | UU16 | 50 | 0..65535 | yes | 当前值 |
| `maxval` | UU16 | 100 | 0..65535 | yes | 最大值(0-65535) |
| `minval` | UU16 | 0 | 0..65535 | yes | 最小值(0-65535) |
| `ch` | UU8 | 25 | 0..100 | yes | 背景宽度百分比(0-100,0为无需填充背景)~sta=1 |

## gauge (objtype 122, prefix `z`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `sta` | Select | 3 | 0..3 | no | 背景填充方式:0-切图;1-单色;2-图片;3-透明 |
| `picc` | Picid | 65535 | 0..65535 | yes | 背景切图(必须是全屏图片)~sta=0 |
| `bco` | Color | 65535 | 0..65535 | yes | 背景色~sta=1 |
| `pic` | Picid | 65535 | 0..65535 | yes | 图片~sta=2 |
| `val` | UU16 | 0 | 0..360 | yes | 当前值 |
| `format` | UU16 | 0 | 0..360 | yes | 补偿值 |
| `up` | SS16 | 32767 | -32766..32767 | yes | 尖长(32767为自动,允许负数) |
| `down` | SS16 | 30 | -32766..32767 | yes | 尾长(允许负数) |
| `left` | UU16 | 0 | 0..1024 | yes | 中心偏移 |
| `pco` | Color | 1024 | 0..65535 | yes | 指针颜色 |
| `pco2` | Color | 63488 | 0..65535 | yes | 中心圆颜色 |
| `hig` | UU8 | 24 | 0..100 | yes | 中心圆直径,最大值:100(0为无中心圆) |
| `vvs0` | UU8 | 1 | 0..128 | yes | 尖宽,最大值:128 |
| `vvs1` | UU8 | 7 | 0..128 | yes | 腰宽,最大值:128 |
| `vvs2` | UU8 | 2 | 0..128 | yes | 尾宽,最大值:128 |

## waveform (objtype 0, prefix `s`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `sta` | Select | 1 | 0..3 | no | 背景填充方式:0-切图;1-单色;2-图片;3-透明 |
| `dir` | Select | 0 | 0..2 | no | 平推方向:0-从左往右;1-从右往左;2-靠右对齐 |
| `ch` | Select | 1 | 1..4 | no | 通道数量(最小1,最大4):1-1;2-2;3-3;4-4 |
| `bco` | Color | 0 | 0..65535 | yes | 背景色~sta=1 |
| `picc` | Picid | 65535 | 0..65535 | yes | 背景切图图片(必须是全屏图片)~sta=0 |
| `pic` | Picid | 65535 | 0..65535 | yes | 背景图片~sta=2 |
| `gdc` | Color | 1024 | 0..65535 | yes | 网格颜色~sta=1 |
| `gdw` | UU8 | 40 | 0..255 | yes | 网格宽度,0为无网格~sta=1 |
| `gdh` | UU8 | 40 | 0..255 | yes | 网格高度,0为无网格~sta=1 |
| `pco0` | Color | 64495 | 0..65535 | yes | 通道0前景色~ch>1 |
| `pco1` | Color | 65519 | 0..65535 | yes | 通道1前景色~ch>2 |
| `pco2` | Color | 63488 | 0..65535 | yes | 通道2前景色~ch>3 |
| `pco3` | Color | 2016 | 0..65535 | yes | 通道3前景色~ch>4 |
| `dis` | UU16 | 100 | 10..1000 | yes | 数据缩放百分比(最小10,最大1000) |

## qrcode (objtype 58, prefix `qr`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `sta` | Select | 0 | 0..1 | no | 中心LOGO:0-无;1-有 |
| `dis` | UU8 | 8 | 0..255 | yes | 内容边距 |
| `bco` | Color | 65535 | 0..65535 | yes | 背景色 |
| `pco` | Color | 0 | 0..65535 | yes | 前景色 |
| `pic` | Picid | 65535 | 0..65535 | yes | 图片~sta=1 |
| `txt` | 30 | AppData.qrcodedefautstring | 0..255 | yes | 字符内容 |
| `txt_maxl` | Strlenth | 30 | 0..630 | no | 字符最大长度(即分配内存空间:0-630) |

## scrolling text (objtype 62, prefix `slt`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `sta` | Select | 1 | 0..3 | no | 背景填充方式:0-切图;1-单色;2-图片;3-透明 |
| `style` | Select | 0 | 0..3 | no | 显示风格:0-平面;1-边框;2-3D_Down;3-3D_Up~sta=1 |
| `key` | key | 255 | 0..255 | no | 绑定键盘 |
| `borderc` | Color | 0 | 0..65535 | yes | 边框颜色~style=1 |
| `borderw` | UU8 | 2 | 0..255 | yes | 边框粗细,最大值:255~style=1 |
| `font` | Fontid | 0 | 0..255 | yes | 字库 |
| `bco` | Color | 65535 | 0..65535 | yes | 背景色~sta=1 |
| `picc` | Picid | 65535 | 0..65535 | yes | 背景切图图片(必须是全屏图片)~sta=0 |
| `pic` | Picid | 65535 | 0..65535 | yes | 背景图片~sta=2 |
| `pco` | Color | 0 | 0..65535 | yes | 字体色 |
| `xcen` | Select | 0 | 0..2 | yes | 水平对齐:0-靠左;1-居中;2-靠右 |
| `left` | Select | 1 | 0..2 | yes | 是否显进度条:0-不显示;1-操作时显示;2-持续显示 |
| `ch` | UU8 | 8 | 0..32 | yes | 滑动惯性力度(0-32,0为无惯性) |
| `txt` | Sstr | 000\r\n111\r\n222\r\n333\r\n444\r\n666\r\n777\r\n777\r\n888\r\n999 | 0..int.MaxValue | yes | 字符内容 |
| `txt_maxl` | Strlenth | 256 | 0..65534 | no | 字符最大长度(即分配内存空间) |
| `isbr` | Select | 1 | 0..1 | yes | 是否自动换行:0-否;1-是 |
| `spax` | UU8 | 0 | 0..255 | yes | 字符横向间距(最小0,最大255) |
| `spay` | UU8 | 0 | 0..255 | yes | 字符纵向间距(最小0,最大255) |
| `path_m` | Strlenth | 0 | 0..65534 | no | 缓冲区大小(此值的1/2表示支持的最大文本行数,0为自动,自动情况下此值等于txt_maxl,即txt_maxl的1/2为支持的最大行数) |
| `maxval_y` | SS32 | 0 | int.MinValue..int.MaxValue | no | 最大纵向滑动值(运行中根据字符内容自动改变,只可读取不可设置) |
| `val_y` | SS32 | 0 | int.MinValue..int.MaxValue | yes | 当前纵向滑动值(最小0,最大maxval_y) |

## switchbutton (objtype 67, prefix `sw`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `dez` | Select | 0 | 0..1 | no | 方向:0-横向;1-竖向 |
| `val` | UU8 | 0 | 0..1 | yes | 当前值 |
| `bco` | Color | 50712 | 0..65535 | yes | 状态0背景色 |
| `pco` | Color | 65535 | 0..65535 | yes | 状态0圆心色 |
| `bco2` | Color | 1024 | 0..65535 | yes | 状态1背景色 |
| `pco2` | Color | 65535 | 0..65535 | yes | 状态1圆心色 |
| `pco1` | Color | 0 | 0..65535 | yes | 字体色 |
| `font` | Fontid | 0 | 0..255 | yes | 字库 |
| `dis` | UU8 | 100 | 0..100 | yes | 外形圆角半径百分比(0-100,0为直角) |
| `txt` | Sstr | False/True | 0..255 | yes | 字符内容(最大24个字符) |

## combobox (objtype 61, prefix `cb`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `sta` | Select | 1 | 0..3 | no | 背景填充方式:0-切图;1-单色;2-图片;3-透明 |
| `style` | Select | 0 | 0..3 | no | 显示风格:0-平面;1-边框;2-3D_Down;3-3D_Up~sta=1 |
| `borderc` | Color | 0 | 0..65535 | yes | 边框颜色~style=1 |
| `borderw` | UU8 | 2 | 0..255 | yes | 边框粗细,最大值:255~style=1 |
| `font` | Fontid | 0 | 0..255 | yes | 字库 |
| `bco` | Color | 65535 | 0..65535 | yes | 背景色~sta=1 |
| `picc` | Picid | 65535 | 0..65535 | yes | 背景切图图片(必须是全屏图片)~sta=0 |
| `pic` | Picid | 65535 | 0..65535 | yes | 背景图片~sta=2 |
| `pco` | Color | 0 | 0..65535 | yes | 字体色 |
| `xcen` | Select | 1 | 0..2 | yes | 水平对齐:0-靠左;1-居中;2-靠右 |
| `ycen` | Select | 1 | 0..2 | yes | 垂直对齐:0-靠上;1-居中;2-靠下 |
| `spax` | UU8 | 0 | 0..255 | yes | 字符横向间距(最小0,最大255) |
| `dis` | UU8 | 25 | 0..100 | yes | 外形圆角半径百分比(0-100,0为直角) |
| `txt` | Sstr | 40V | 0..int.MaxValue | yes | 字符内容(运行中会根据val值的变化自动改变) |
| `txt_maxl` | Strlenth | 32 | 0..65534 | no | 字符最大长度(即分配内存空间) |
| `up` | Select | 1 | 0..1 | yes | 字符框是否显示箭头:0-不显示;1-显示 |
| `pco3` | Color | 42292 | 0..65535 | yes | 字符框箭头颜色 |
| `bco1` | Color | 65535 | 0..65535 | yes | 单元格背景色 |
| `pco1` | Color | 0 | 0..65535 | yes | 单元格字体色 |
| `path` | Sstr | 40V\r\n60V\r\n80V\r\n100V\r\n120V\r\n140V | 0..int.MaxValue | yes | 单元格内容集合(请使用多行输入,每行为一条单元格内容) |
| `path_m` | Strlenth | 256 | 0..65534 | no | 单元格内容集合最大长度(即分配内存空间) |
| `dir` | Select | 1 | 0..255 | yes | 单元格展开方向:0-上;1-下;2-左;3-右 |
| `qty` | UU8 | 4 | 1..254 | yes | 最大展开单元格数量(1-254) |
| `vvs0` | UU8 | 8 | 0..255 | yes | 展开单元格间距(最小0,最大255) |
| `val` | UU8 | 0 | 0..255 | yes | 当前选中单元格ID(运行中每次改变会将相应的内容同步到txt属性) |
| `bco2` | Color | 31 | 0..65535 | yes | 选中单元格背景色 |
| `pco2` | Color | 65535 | 0..65535 | yes | 选中单元格字体色 |
| `hig` | UU8 | 42 | 16..255 | yes | 单元格高度/宽度(16-255,上下展开时表示高度;左右展开时表示宽度) |
| `down` | Select | 0 | 0..1 | yes | 单元格展开状态:0-收缩;1-展开 |
| `mode` | Select | 2 | 0..2 | yes | 单元格可滑动标识类型:0-无显示;1-仅显示三角形;2-显示背景+三角形 |
| `wid` | UU8 | 12 | 8..255 | yes | 单元格可滑动标识高度/宽度(8-255,上下展开时表示高度;左右展开时表示宽度) |
| `vvs1` | UU8 | 2 | 0..255 | yes | 单元格可滑动标识与单元格间距(0-255) |
| `ch` | UU8 | 8 | 0..32 | yes | 滑动惯性力度(0-32,0为无惯性) |

## text select (objtype 68, prefix `select`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `sta` | Select | 1 | 0..3 | no | 背景填充方式:0-切图;1-单色;2-图片;3-透明 |
| `style` | Select | 0 | 0..1 | no | 显示风格:0-平面;1-边框~sta=1 |
| `borderc` | Color | 0 | 0..65535 | yes | 边框颜色~style=1 |
| `borderw` | UU8 | 2 | 0..255 | yes | 边框粗细,最大值:255~style=1 |
| `font` | Fontid | 0 | 0..255 | yes | 字库 |
| `bco` | Color | 65535 | 0..65535 | yes | 背景色~sta=1 |
| `picc` | Picid | 65535 | 0..65535 | yes | 背景切图图片(必须是全屏图片)~sta=0 |
| `pic` | Picid | 65535 | 0..65535 | yes | 背景图片~sta=2 |
| `pco` | Color | 0 | 0..65535 | yes | 默认字体色 |
| `pco2` | Color | 31 | 0..65535 | yes | 选中项字体色 |
| `spax` | UU8 | 0 | 0..255 | yes | 字符横向间距(最小0,最大255) |
| `hig` | UU8 | 42 | 16..255 | yes | 显示记录的行高度(最小16,最大255) |
| `dis` | Select | 1 | 0..1 | yes | 选中项加横线:0-否;1-是 |
| `pco1` | Color | 31 | 0..65535 | yes | 横线颜色~dis=1 |
| `txt` | Sstr |  | 0..int.MaxValue | no | 当前val值指向的文本(自动随val值改变,只可获取不可设置) |
| `val` | SS32 | 0 | 0..65535 | yes | 当前选择项ID(每改变一次,txt值会相应变化) |
| `ch` | UU8 | 8 | 0..32 | yes | 滑动惯性力度(0-32,0为无惯性) |
| `path` | Sstr | 01\r\n02\r\n03\r\n04\r\n05\r\n06\r\n07\r\n08\r\n09\r\n10\r\n11\r\n12 | 0..int.MaxValue | yes | 滑动选择项集合(每行为一项) |
| `path_m` | Strlenth | 1024 | 0..8192 | no | 滑动选择项集合最大长度(即分配内存空间) |

## gtext (rich text) (objtype 55, prefix `g`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `sta` | Select | 1 | 0..3 | no | 背景填充方式:0-切图;1-单色;2-图片;3-透明 |
| `style` | Select | 0 | 0..3 | no | 显示风格:0-平面;1-边框;2-3D_Down;3-3D_Up~sta=1 |
| `key` | key | 255 | 0..255 | no | 绑定键盘 |
| `borderc` | Color | 0 | 0..65535 | yes | 边框颜色~style=1 |
| `borderw` | UU8 | 2 | 0..255 | yes | 边框粗细,最大值:255~style=1 |
| `font` | Fontid | 0 | 0..255 | yes | 字库 |
| `bco` | Color | 65535 | 0..65535 | yes | 背景色~sta=1 |
| `picc` | Picid | 65535 | 0..65535 | yes | 背景切图图片(必须是全屏图片)~sta=0 |
| `pic` | Picid | 65535 | 0..65535 | yes | 背景图片~sta=2 |
| `pco` | Color | 0 | 0..65535 | yes | 字体色 |
| `xcen` | Select | 1 | 0..2 | yes | 水平对齐:0-靠左;1-居中;2-靠右 |
| `ycen` | Select | 1 | 0..2 | yes | 垂直对齐:0-靠上;1-居中;2-靠下 |
| `dir` | Select | 1 | 0..3 | yes | 滚动方向:0-从左往右;1-从右往左;2-从上往下;3-从下往上 |
| `dis` | UU8 | 4 | 2..50 | yes | 滚动幅度像素值(最小2,最大50) |
| `tim` | UU16 | 150 | 80..65534 | yes | 滚动周期(单位ms,最小80,最大65534) |
| `en` | UU8 | 1 | 0..1 | yes | 滚动使能:0为关闭,1为开启 |
| `txt` | Sstr | newtxt | 0..int.MaxValue | yes | 字符内容 |
| `txt_maxl` | Strlenth | 10 | 0..65534 | no | 字符最大长度(即分配内存空间) |
| `isbr` | Select | 0 | 0..1 | yes | 是否自动换行:0-否;1-是 |
| `spax` | UU8 | 0 | 0..255 | yes | 字符横向间距(最小0,最大255) |
| `spay` | UU8 | 0 | 0..255 | yes | 字符纵向间距(最小0,最大255) |

## gmov (objtype 2, prefix `gm`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `vid` | Gmovid | 65535 | 0..65535 | yes | 动画ID~from=0 |
| `en` | UU8 | 1 | 0..2 | yes | 播放状态(0-停止;1-播放;2-暂停) |
| `loop` | Select | 1 | 0..1 | yes | 循环播放:0-否;1-是 |
| `dis` | UU16 | 100 | 10..1000 | yes | 播放速度百分比(最小10,最大1000) |
| `tim` | SS32 | 0 | int.MinValue..int.MaxValue | yes | 当前播放时间(ms) |
| `stim` | SS32 | 0 | int.MinValue..int.MaxValue | no | 总时间(由动画文件决定，不可设置,运行中可获取) |
| `qty` | SS32 | 0 | int.MinValue..int.MaxValue | no | 总帧数(由动画文件决定，不可设置,运行中可获取) |

## avi (objtype 3, prefix `v`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `from` | Select | 0 | 0..1 | no | 播放源:0-内部资源文件;1-外部文件 |
| `vid` | Videoid | 65535 | 0..65535 | yes | 视频ID~from=0 |
| `path` | Sstr |  | 0..int.MaxValue | yes | 外部视频文件路径(如:\"ram/0.video\"或\"sd0/1.video\")~from=1 |
| `en` | UU8 | 1 | 0..2 | yes | 播放状态(0-停止;1-播放;2-暂停) |
| `loop` | Select | 1 | 0..1 | yes | 循环播放:0-否;1-是 |
| `dis` | UU16 | 100 | 10..1000 | yes | 播放速度百分比(最小10,最大1000) |
| `tim` | SS32 | 0 | int.MinValue..int.MaxValue | yes | 当前播放时间(ms) |
| `stim` | SS32 | 0 | int.MinValue..int.MaxValue | no | 总时间(由视频文件决定，不可设置,运行中可获取) |
| `qty` | SS32 | 0 | int.MinValue..int.MaxValue | no | 总帧数(由视频文件决定，不可设置,运行中可获取) |

## wav (objtype 4, prefix `wav`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `from` | Select | 0 | 0..1 | no | 播放源:0-内部资源文件;1-外部文件 |
| `vid` | Audioid | 65535 | 0..65535 | yes | 音频ID~from=0 |
| `path` | Sstr |  | 0..int.MaxValue | yes | 外部音频文件路径(如:\"ram/0.wav\"或\"sd0/1.wav\")~from=1 |
| `en` | UU8 | 1 | 0..2 | yes | 播放状态(0-停止;1-播放;2-暂停) |
| `loop` | Select | 1 | 0..1 | yes | 循环播放:0-否;1-是 |
| `tim` | SS32 | 0 | int.MinValue..int.MaxValue | yes | 当前播放时间(ms) |
| `stim` | SS32 | 0 | int.MinValue..int.MaxValue | no | 总时间(由音频文件决定，不可设置,运行中可获取) |

## Touchcap (objtype 5, prefix `tc`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `val` | UU8 | 0 | 0..65535 | no | 本次捕捉控件ID |

## expic (objtype 60, prefix `exp`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `path` | Sstr |  | 0..int.MaxValue | yes | 图片文件路径(如:\"ram/0.jpg\"或\"sd0/1.jpg\") |

## filestream (objtype 63, prefix `fs`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `val` | SS32 | 0 | 0..int.MaxValue | yes | 此文件流当前数据指针(打开文件时恢复为0,读写操作过程中自动移动,支持手动设置) |
| `qty` | SS32 | 0 | 0..int.MaxValue | no | 文件大小(运行中根据实际打开的文件自动更新,只可获取不可设置) |
| `en` | UU8 | 0 | 0..1 | no | 文件打开状态(只可获取不可设置) |
| `open` | SS32 | 357 | int.MinValue..int.MaxValue | yes | 打开文件(成功返回1,失败返回0)/string path@文件路径(如:\"sd0/1.txt\") |
| `read` | SS32 | 869 | int.MinValue..int.MaxValue | yes | 从当前流读数据(成功返回1,失败返回0,从当前数据指针[val属性]位置开始读,读完以后指针将自动移动相应的长度)/object att@变量名称(字符串或数值均可)/int star@变量中的起始地址(一般为0)/int lenth@读入数据长度 |
| `write` | SS32 | 869 | int.MinValue..int.MaxValue | yes | 将数据写入当前流(成功返回1,失败返回0,从当前数据指针[val属性]位置开始写,写完以后指针将自动移动相应的长度)/object att@变量名称(字符串或数值均可)/int star@变量中的起始地址(一般为0)/int lenth@写入数据长度 |
| `close` | SS32 | 101 | int.MinValue..int.MaxValue | yes | 关闭文件流(成功返回1,失败返回0,文件打开读写操作完成后一定要记得关闭文件,同一个文件在打开后,关闭之前,是不能被另外一个文件流控件打开的) |
| `find` | SS32 | 357 | int.MinValue..int.MaxValue | yes | 按关键字查询并定位文件流指针(查询成功返回1,失败返回0,从当前流的当前数据指针[val属性]位置开始查询关键字,如果查询成功,数据指针将会移动到关键字中第一个字符处;如果查询失败保持数据当前指针不变)/string key@关键字字符串变量/常量 |

## filedirectory (objtype 64, prefix `fd`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `dir` | Sstr | sd0/ | 0..int.MaxValue | yes | 需要遍历的目录路径(每设置一次将重新刷新一次文件列表) |
| `filter` | Sstr | *.* | 0..int.MaxValue | yes | 文件名关键字过滤(多个关键字使用/分隔,如:\"*.txt/*.data\") |
| `val` | SS32 | 0 | int.MinValue..int.MaxValue | yes | 当前选中项序号(每改变一次,txt值将重新赋值为新的val值指向的文件名) |
| `qty` | SS32 | 0 | 0..int.MaxValue | no | 遍历结果中的文件总数 |
| `txt` | Sstr |  | 0..int.MaxValue | no | 当前val值指向的文件名(自动随val值改变,只可获取不可设置) |
| `buffsize` | SS32 | 32000 | 0..int.MaxValue | no | 储存遍历结果所使用的缓冲区大小(用于储存遍历出来的所有文件名,推荐32000) |

## filebrowser (objtype 65, prefix `fbrowser`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `sta` | Select | 1 | 0..3 | no | 背景填充方式:0-切图;1-单色;2-图片;3-透明 |
| `style` | Select | 2 | 0..3 | no | 显示风格:0-平面;1-边框;2-3D_Down;3-3D_Up~sta=1 |
| `borderc` | Color | 0 | 0..65535 | yes | 边框颜色~style=1 |
| `borderw` | UU8 | 2 | 0..255 | yes | 边框粗细,最大值:255~style=1 |
| `font` | Fontid | 0 | 0..255 | yes | 字库 |
| `bco` | Color | 65535 | 0..65535 | yes | 背景色~sta=1 |
| `picc` | Picid | 65535 | 0..65535 | yes | 背景切图图片(必须是全屏图片)~sta=0 |
| `pic` | Picid | 65535 | 0..65535 | yes | 背景图片~sta=2 |
| `pco` | Color | 0 | 0..65535 | yes | 默认字体色 |
| `pco2` | Color | 65535 | 0..65535 | yes | 选中项字体色 |
| `bco2` | Color | 31 | 0..65535 | yes | 选中项背景色 |
| `left` | Select | 1 | 0..2 | yes | 是否显进度条:0-不显示;1-操作时显示;2-持续显示 |
| `ch` | UU8 | 8 | 0..32 | yes | 滑动惯性力度(0-32,0为无惯性) |
| `dir` | Sstr | sd0/ | 0..int.MaxValue | yes | 需要遍历的目录路径(每设置一次将重新刷新一次文件列表) |
| `filter` | Sstr | *.* | 0..int.MaxValue | yes | 文件名关键字过滤(多个关键字使用/分隔,如:\"*.txt/*.data\") |
| `val` | SS32 | -1 | int.MinValue..int.MaxValue | yes | 当前选中项序号(每改变一次,txt值将重新赋值为新的val值指向的文件名) |
| `txt` | Sstr |  | 0..int.MaxValue | no | 当前val值指向的文件名(自动随val值改变,只可获取不可设置) |
| `qty` | SS32 | 0 | 0..int.MaxValue | no | 遍历结果中的文件总数 |
| `dis` | UU8 | 3 | 0..255 | yes | 文件名显示行数 |
| `spax` | UU8 | 24 | 0..255 | yes | 文件名显示横向间距(最小0,最大255) |
| `spay` | UU8 | 8 | 0..255 | yes | 文件名显示纵向间距 |
| `maxval_y` | SS32 | 0 | int.MinValue..int.MaxValue | no | 最大纵向滑动值(运行中根据字符内容自动改变,只可读取不可设置) |
| `val_y` | SS32 | 0 | int.MinValue..int.MaxValue | yes | 当前纵向滑动值(最小0,最大maxval_y) |
| `psta` | Select | 1 | 0..1 | no | 是否支持子文件夹:0-否;1-是 |
| `pic1` | Picid | 65535 | 0..65535 | yes | 文件夹图标~psta=1 |
| `pic2` | Picid | 65535 | 0..65535 | yes | 默认文件图标 |
| `vvs2` | Sstr |  | 0..int.MaxValue | yes | 自定义文件图标(类型/图片ID,如:\"*.txt/2*.data/3\") |
| `buffsize` | SS32 | 32000 | 0..int.MaxValue | no | 储存遍历结果所使用的缓冲区大小(用于储存遍历出来的所有文件名,推荐32000) |
| `up` | SS32 | 0 | int.MinValue..int.MaxValue | yes | 跳转到上一级目录(成功返回1,失败返回0) |
| `fwarning` | Select | 1 | 0..1 | no | 编译时是否提示非utf-8编码警告(此属性仅用于编译配置,运行中不可访问不可读取):0-不提示;1-提示 |

## datarecord (objtype 66, prefix `data`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `sta` | Select | 1 | 0..3 | no | 背景填充方式:0-切图;1-单色;2-图片;3-透明 |
| `style` | Select | 2 | 0..3 | no | 显示风格:0-平面;1-边框;2-3D_Down;3-3D_Up~sta=1 |
| `borderc` | Color | 0 | 0..65535 | yes | 边框颜色~style=1 |
| `borderw` | UU8 | 2 | 0..255 | yes | 边框粗细,最大值:255~style=1 |
| `font` | Fontid | 0 | 0..255 | yes | 字库 |
| `bco` | Color | 65535 | 0..65535 | yes | 背景色~sta=1 |
| `picc` | Picid | 65535 | 0..65535 | yes | 背景切图图片(必须是全屏图片)~sta=0 |
| `pic` | Picid | 65535 | 0..65535 | yes | 背景图片~sta=2 |
| `pco` | Color | 0 | 0..65535 | yes | 字体色 |
| `xcen` | Select | 0 | 0..2 | yes | 水平对齐:0-靠左;1-居中;2-靠右 |
| `path` | Sstr | sd0/1.data | 0..int.MaxValue | yes | 绑定数据文件路径(如:\"sd0/1.data\") |
| `lenth` | SS32 | 63 | 2..255 | no | 当前绑定数据记录文件中每条记录最大字节数 |
| `maxval` | SS32 | 1000 | 1..int.MaxValue | no | 当前绑定数据记录文件可存入的最大行数,超出之后的新增记录将循环覆盖老数据) |
| `dez` | UU16 | 3 | 1..12 | no | 当前绑定数据记录文件中设置的字段数量(最小1,最大12) |
| `format` | Sstr |  | 0..int.MaxValue | yes | 字段宽度自定义(直接输入字段宽度值,多个字段使用^分隔,如:100^100) |
| `dir` | Sstr | head0^head1^head2 | 0..int.MaxValue | yes | 表头名称自定义(多个字段使用^分隔) |
| `mode` | Select | 1 | 0..1 | yes | 是否允许自动创建文件(path路径无效时):0-不允许;1-允许 |
| `dis` | Select | 1 | 0..1 | yes | 是否允许触摸选中记录项:0-不允许;1-允许 |
| `order` | Select | 0 | 0..1 | yes | 显示顺序:0-新数据在前;1-新数据在后 |
| `qty` | SS32 | 0 | int.MinValue..int.MaxValue | no | 当前数据文件总记录数 |
| `spax` | UU8 | 0 | 0..255 | yes | 字符横向间距(最小0,最大255) |
| `hig` | UU8 | 32 | 1..255 | yes | 显示记录的行高度(最小1,最大255) |
| `left` | Select | 1 | 0..2 | yes | 是否显进度条:0-不显示;1-操作时显示;2-持续显示 |
| `gdc` | Color | 50712 | 0..65535 | yes | 表格线颜色 |
| `gdw` | UU8 | 1 | 0..255 | yes | 横向表格线宽度(0为关闭) |
| `gdh` | UU8 | 1 | 0..255 | yes | 纵向表格线宽度(0为关闭) |
| `bco1` | Color | 23765 | 0..65535 | yes | 表头背景色 |
| `pco1` | Color | 65535 | 0..65535 | yes | 表头字体色 |
| `bco2` | Color | 31 | 0..65535 | yes | 选中项背景色 |
| `pco2` | Color | 65535 | 0..65535 | yes | 选中项字体色 |
| `val` | SS32 | -1 | int.MinValue..int.MaxValue | yes | 当前选中行记录ID(每变化一次,txt属性将重新加载此ID的行记录内容) |
| `txt` | Sstr |  | 0..int.MaxValue | no | 行记录内容(val值代表的行号记录内容，只可读取不可修改) |
| `insert` | SS32 | 357 | int.MinValue..int.MaxValue | yes | 追加一条记录(成功返回1,失败返回0)/string newtxt@新数据(多个字段使用^分割;颜色定义使用<font>标签,如:<font b=1024,p=123>) |
| `delete` | SS32 | 512 | int.MinValue..int.MaxValue | yes | 删除数据(成功返回1,失败返回0)/int starid@待删除数据起始ID/int qty@需要删除的条数 |
| `up` | SS32 | 613 | int.MinValue..int.MaxValue | yes | 修改一条记录(成功返回1,失败返回0)/string newtxt@新数据(多个字段使用^分割;颜色定义使用<font>标签,如:<font b=1024,p=123>)/int index@需要修改的记录ID |
| `clear` | SS32 | 101 | int.MinValue..int.MaxValue | yes | 清除所有数据记录 |
| `ch` | UU8 | 8 | 0..32 | yes | 滑动惯性力度(0-32,0为无惯性) |
| `maxval_y` | SS32 | 0 | int.MinValue..int.MaxValue | no | 最大纵向滑动值(运行中根据字符内容自动改变,只可读取不可设置) |
| `val_y` | SS32 | 0 | int.MinValue..int.MaxValue | yes | 当前纵向滑动值(最小0,最大maxval_y) |
| `maxval_x` | SS32 | 0 | int.MinValue..int.MaxValue | no | 最大横向滑动值(运行中根据字符内容自动改变,只可读取不可设置) |
| `val_x` | SS32 | 0 | int.MinValue..int.MaxValue | yes | 当前横向滑动值(最小0,最大maxval_x) |

## Printer3D (objtype 69, prefix `pr`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `en` | UU8 | 0 | 0..2 | yes | 打印工作状态(0-停止中 1-打印中 2-暂停中) |
| `sta` | UU8 | 0 | 0..1 | no | 与主板连接状态(0-无连接,1-连接) |
| `mode` | UU8 | 0 | 0..1 | no | 当前工作状态(0-正常,1-平台预热中,2-喷头预热中) |
| `pw` | UU8 | 0 | 0..1 | yes | 模型打印完成中断标志位 |
| `val` | UU8 | 0 | 0..255 | yes | 打印过程中出现的错误号 |
| `pic` | Picid | 65535 | 0..65535 | yes | 默认预览图片 |
| `path` | Sstr |  | 0..int.MaxValue | yes | gcode预览图文件路径(如:\"ram/main.xi\" |
| `dez` | SS32 | 0 | int.MinValue..int.MaxValue | yes | 打印模型文件当前数据指针 |
| `ch` | SS32 | 0 | int.MinValue..int.MaxValue | yes | 模型已打印高度 |
| `tim` | SS32 | 0 | int.MinValue..int.MaxValue | yes | 模型已打印时间(秒) |
| `vid` | SS32 | 0 | int.MinValue..int.MaxValue | no | 指令缓冲区已缓冲指令条数 |
| `vvs0` | SS32 | 0 | int.MinValue..int.MaxValue | no | X轴 |
| `vvs1` | SS32 | 0 | int.MinValue..int.MaxValue | no | Y轴 |
| `vvs2` | SS32 | 0 | int.MinValue..int.MaxValue | no | Z轴 |
| `hig` | SS32 | 0 | int.MinValue..int.MaxValue | no | 当前打印模型的总高 |
| `dis` | SS32 | 0 | int.MinValue..int.MaxValue | no | 当前打印模型的层厚 |
| `fps` | SS32 | 0 | int.MinValue..int.MaxValue | no | 当前打印速率 |
| `disup` | SS32 | 0 | int.MinValue..int.MaxValue | no | 当前Z轴微调 |
| `open` | SS32 | 357 | int.MinValue..int.MaxValue | yes | 打开文件(成功返回1,失败返回0)/string path@文件路径(如:\"sd0/sun.gcode\") |
| `close` | SS32 | 255 | int.MinValue..int.MaxValue | yes | 关闭文件 |
| `up` | SS32 | 255 | int.MinValue..int.MaxValue | yes | 更新一次缓冲区数据(返回本次更新的数据大小) |
| `read` | SS32 | 614 | int.MinValue..int.MaxValue | yes | 读数据/string com@数据关键字/att data@储存数据的变量 |
| `down` | SS32 | 870 | int.MinValue..int.MaxValue | yes | 预览图生成/string srcpath@gcode源文件路径/string decpath@目标图片路径/int state@生成图片宽度 |
| `insert` | SS32 | 614 | int.MinValue..int.MaxValue | yes | 添加控制指令(指令为空时返回控制指令缓冲区剩余大小)/string code@加入的代码 |
| `buffsize` | SS32 | 24000 | int.MinValue..int.MaxValue | no | 预读Gcode缓冲区大小 |

## ColPic (objtype 70, prefix `cp`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `write` | SS32 | 357 | int.MinValue..int.MaxValue | yes | 写入编码数码/string data@编码数据 |
| `close` | SS32 | 101 | int.MinValue..int.MaxValue | yes | 清空缓冲区 |
| `buffsize` | SS32 | 100000 | 0..int.MaxValue | no | 缓冲区大小 |

## TouchUpVP (objtype 110, prefix `tu`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `up` | Hex16 | 65535 | 0..65535 | yes | 上传代码(HEX格式,非十进制,0xFFFF表示无效,不上传) |
| `sta` | Select | 3 | 0..3 | no | 背景填充方式:0-切图;1-单色;2-图片;3-透明 |
| `pic` | Picid | 65535 | 0..65535 | yes | 默认背景图片~sta=2 |
| `picc` | Picid | 65535 | 0..65535 | yes | 默认切图背景(必须是全屏图片)~sta=0 |
| `bco` | Color | 50712 | 0..65535 | yes | 默认背景色~sta=1 |
| `pic2` | Picid | 65535 | 0..65535 | yes | 按下背景图片~sta=2 |
| `picc2` | Picid | 65535 | 0..65535 | yes | 按下切图背景(必须是全屏图片)~sta=0 |
| `bco2` | Color | 1024 | 0..65535 | yes | 按下背景色~sta=1 |
| `mode` | Select | 1 | 0..1 | yes | 上传模式:0-只有弹起才上传;1-按下弹起都上传 |
| `vvs0` | Select | 1 | 0..1 | yes | 按下后100ms循环上传:0-不循环;1-要循环~mode=1 |

## inputTxt_VP (objtype 125, prefix `VPint`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `VP` | UU16 | 65535 | 0..65535 | yes | 文本地址(HEX格式,非10进制) |
| `lenth` | UU8 | 10 | 0..128 | yes | 键盘录入数据的最大长度 |
| `key` | Pageid | 255 | 0..255 | no | 绑定键盘页面ID(255为无效) |
| `up` | Select | 0 | 0..1 | yes | 录入后是否上传数据到串口:0-不上传;1-要上传; |
| `pw` | Select | 0 | 0..1 | yes | 录入时是否显示为密码:0-否;1-是 |
| `mode` | Select | 0 | 0..1 | yes | 录入模式:0-重新录入;1-修改文本 |
| `path` | Sstr |  | 0..int.MaxValue | no | 录入数据显示左上角坐标(留空为默认位置) |

## input_VP (objtype 126, prefix `VPin`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `VP` | UU16 | 65535 | 0..65535 | yes | 变量地址(HEX格式,非10进制) |
| `mode` | Select | 0 | 0..6 | yes | 数据类型:0-s16(16位有符号整数);1-s32(32位有符号整数);2-u8h(寄存器高8位);3-u8l(寄存器低8位);5-u16(16位无符号整数);6-u32(32位无符号整数) |
| `vvs0` | UU8 | 0 | 0..10 | yes | 整数位数(0为自动,最大10位) |
| `vvs1` | UU8 | 0 | 0..8 | yes | 小数位数(0为无小数,最大8位) |
| `key` | Pageid | 255 | 0..255 | no | 绑定键盘页面ID(255为无效) |
| `lenth` | UU8 | 10 | 0..128 | yes | 键盘录入数据的最大长度 |
| `up` | Select | 0 | 0..1 | yes | 录入后是否上传数据到串口:0-不上传;1-要上传; |
| `pw` | Select | 0 | 0..1 | yes | 录入时是否显示为密码:0-否;1-是 |
| `maxval` | SS32 | 2147483647 | int.MinValue..int.MaxValue | yes | 最大值~mode<9 |
| `minval` | SS32 | -2147483648 | int.MinValue..int.MaxValue | yes | 最小值~mode<9 |
| `path` | Sstr |  | 0..int.MaxValue | no | 录入数据显示右上角坐标(留空为默认位置) |

## yfloat_VP (objtype 127, prefix `VPy`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `RAM1` | UU16 | 65535 | 4096..65535 | no | 描述地址(HEX格式,非10进制) |
| `VP` | UU16 | 65535 | 0..65535 | no | 变量地址(HEX格式,非10进制) |
| `vvs0` | UU8 | 0 | 0..10 | yes | 整数位数(0为自动,最大10位) |
| `vvs1` | UU8 | 0 | 0..8 | yes | 小数位数(0为无小数,最大8位) |
| `xcen` | Select | 0 | 0..2 | yes | 水平对齐:0-靠左;1-居中;2-靠右 |
| `ycen` | Select | 0 | 0..2 | yes | 垂直对齐:0-靠上;1-居中;2-靠下 |
| `pic` | Picid | 0 | 0..65535 | yes | 起始图片(数字对应的图片顺序为:0123456789-.) |
| `sta` | Select | 0 | 0..1 | no | 滤除背景:0-不滤除;1-要滤除 |
| `val` | SS16 | 0 | -32768..32767 | yes | 当前值 |

## text_VP (objtype 128, prefix `VPt`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `RAM1` | UU16 | 65535 | 4096..65535 | no | 描述地址(HEX格式,非10进制) |
| `VP` | UU16 | 65535 | 0..65535 | no | 变量地址(HEX格式,非10进制) |
| `sta` | Select | 1 | 0..3 | no | 背景填充方式:0-切图;1-单色;2-图片;3-透明 |
| `style` | Select | 0 | 0..3 | no | 显示风格:0-平面;1-边框;2-3D_Down;3-3D_Up~sta=1 |
| `key` | Pageid | 255 | 0..255 | no | 绑定键盘页面ID(255为无效) |
| `up` | Select | 0 | 0..1 | yes | 键盘录入后是否上传数据到串口:0-不上传;1-要上传; |
| `borderc` | Color | 0 | 0..65535 | yes | 边框颜色~style=1 |
| `borderw` | UU8 | 2 | 0..255 | yes | 边框粗细,最大值:255~style=1 |
| `font` | Fontid | 0 | 0..255 | yes | 字库 |
| `bco` | Color | 65535 | 0..65535 | yes | 背景色~sta=1 |
| `picc` | Picid | 65535 | 0..65535 | yes | 背景切图图片(必须是全屏图片)~sta=0 |
| `pic` | Picid | 65535 | 0..65535 | yes | 背景图片~sta=2 |
| `pco` | Color | 0 | 0..65535 | yes | 字体色 |
| `xcen` | Select | 1 | 0..2 | yes | 水平对齐:0-靠左;1-居中;2-靠右 |
| `ycen` | Select | 1 | 0..2 | yes | 垂直对齐:0-靠上;1-居中;2-靠下 |
| `pw` | Select | 0 | 0..1 | yes | 是否显示为密码(内容仍为实际内容,仅仅显示出来为*):0-否;1-是 |
| `txt` | Sstr | newtxt | 4096..65535 | yes | 字符内容 |
| `txt_maxl` | Strlenth | 10 | 0..65534 | no | 字符最大长度(即分配内存空间) |
| `isbr` | Select | 0 | 0..1 | yes | 是否自动换行:0-否;1-是 |
| `spax` | UU8 | 0 | 0..255 | yes | 字符横向间距(最小0,最大255) |
| `spay` | UU8 | 0 | 0..255 | yes | 字符纵向间距(最小0,最大255) |

## xfloat_VP (objtype 129, prefix `VPx`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `RAM1` | UU16 | 65535 | 4096..65535 | no | 描述地址(HEX格式,非10进制) |
| `VP` | UU16 | 65535 | 0..65535 | no | 变量地址(HEX格式,非10进制) |
| `sta` | Select | 1 | 0..3 | no | 背景填充方式:0-切图;1-单色;2-图片;3-透明 |
| `style` | Select | 0 | 0..3 | no | 显示风格:0-平面;1-边框;2-3D_Down;3-3D_Up~sta=1 |
| `key` | Pageid | 255 | 0..255 | no | 绑定键盘页面ID(255为无效) |
| `up` | Select | 0 | 0..1 | yes | 键盘录入后是否上传数据到串口:0-不上传;1-要上传; |
| `borderc` | Color | 0 | 0..65535 | yes | 边框颜色~style=1 |
| `borderw` | UU8 | 2 | 0..255 | yes | 边框粗细,最大值:255~style=1 |
| `font` | Fontid | 0 | 0..255 | yes | 字库 |
| `bco` | Color | 65535 | 0..65535 | yes | 背景色~sta=1 |
| `picc` | Picid | 65535 | 0..65535 | yes | 背景切图图片(必须是全屏图片)~sta=0 |
| `pic` | Picid | 65535 | 0..65535 | yes | 背景图片~sta=2 |
| `pco` | Color | 0 | 0..65535 | yes | 字体色 |
| `xcen` | Select | 1 | 0..2 | yes | 水平对齐:0-靠左;1-居中;2-靠右 |
| `ycen` | Select | 1 | 0..2 | yes | 垂直对齐:0-靠上;1-居中;2-靠下 |
| `val` | SS16 | 0 | -32768..32767 | yes | 当前值~mode<6 |
| `vvs0` | UU8 | 0 | 0..10 | yes | 整数位数(0为自动,最大10位) |
| `vvs1` | UU8 | 0 | 0..8 | yes | 小数位数(0为无小数,最大8位) |
| `isbr` | Select | 1 | 0..1 | yes | 是否自动换行:0-否;1-是 |
| `spax` | UU8 | 0 | 0..255 | yes | 字符横向间距(最小0,最大255) |
| `spay` | UU8 | 0 | 0..255 | yes | 字符纵向间距(最小0,最大255) |

## prog_VP (objtype 130, prefix `VPj`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `RAM1` | UU16 | 65535 | 4096..65535 | no | 描述地址(HEX格式,非10进制) |
| `VP` | UU16 | 65535 | 0..65535 | no | 变量地址(HEX格式,非10进制) |
| `sta` | Select | 0 | 0..1 | no | 填充方式:0-单色;1-图片 |
| `dez` | Select | 0 | 0..1 | no | 进度方式:0-横向;1-竖向 |
| `val` | SS16 | 0 | -32768..32767 | yes | 当前值~mode<6 |
| `pic` | Picid | 0 | 0..65535 | yes | 起始图片 |
| `dis` | UU8 | 25 | 0..100 | yes | 外形圆角半径百分比(0-100,0为直角)~sta=0 |
| `bco` | Color | 48631 | 0..65535 | yes | 背景色~sta=0 |
| `bpic` | Picid | 65535 | 0..65535 | yes | 背景图片~sta=1 |
| `pco` | Color | 1024 | 0..65535 | yes | 前景色~sta=0 |
| `ppic` | Picid | 65535 | 0..65535 | yes | 前景图片~sta=1 |

## pic_VP (objtype 131, prefix `VPp`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `RAM1` | UU16 | 65535 | 4096..65535 | no | 描述地址(HEX格式,非10进制) |
| `VP` | UU16 | 65535 | 0..65535 | no | 变量地址(HEX格式,非10进制) |
| `val` | UU16 | 0 | 0..65535 | yes | 当前值 |
| `sta` | Select | 0 | 0..1 | no | 滤除背景:0-不滤除;1-要滤除 |
| `minval` | UU16 | 0 | int.MinValue..int.MaxValue | yes | val最小值~mode<9 |
| `maxval` | UU16 | 0 | int.MinValue..int.MaxValue | yes | val最大值~mode<9 |
| `pic0` | Picid | 0 | 0..65535 | yes | val最小值对应的图片~mode<9 |
| `pic1` | Picid | 0 | 0..65535 | yes | val最大值对应的图片~mode<9 |
| `vvs0` | Picid | 65535 | int.MinValue..int.MaxValue | yes | val相应位为0时的图片ID~mode>10 |
| `vvs1` | Picid | 65535 | int.MinValue..int.MaxValue | yes | val相应位为1时的图片ID~mode>10 |

## button_VP (objtype 132, prefix `VPb`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `RAM1` | UU16 | 65535 | 4096..65535 | no | 描述地址(HEX格式,非10进制) |
| `VP` | UU16 | 65535 | 0..65535 | no | 变量地址(HEX格式,非10进制) |
| `mode` | Select | 0 | 0..6 | no | 数据类型:0-s16(16位有符号整数);1-s32(32位有符号整数);2-u8h(寄存器高8位);3-u8l(寄存器低8位);5-u16(16位无符号整数);6-u32(32位无符号整数) |
| `format` | Select | 0 | 0..2 | yes | 变量修改类型:0-设定;1-累加;2-按位写入 |
| `write` | SS32 | 0 | int.MinValue..int.MaxValue | yes | 设定值(十进制格式)~format=0 |
| `dis` | SS32 | 0 | int.MinValue..int.MaxValue | yes | 累加值(十进制格式)~format=1 |
| `ch` | SS32 | 0 | 0..15 | yes | 位地址~format=2 |
| `loop` | Select | 0 | 0..1 | yes | 是否循环:0-不循环;1-循环~format=1 |
| `up` | Select | 1 | 0..1 | yes | 是否上传:0-不上传;1-上传 |
| `maxval` | SS32 | 2147483647 | int.MinValue..int.MaxValue | yes | 最大值~format=1 |
| `minval` | SS32 | -2147483648 | int.MinValue..int.MaxValue | yes | 最小值~format=1 |
| `vvs0` | Select | 1 | 0..1 | yes | 调节模式:0-按下只调节一次;1-按下后一直调节~format=1 |
| `sta` | Select | 1 | 0..3 | no | 背景填充方式:0-切图;1-单色;2-图片;3-透明 |
| `style` | Select | 4 | 0..4 | no | 显示风格:0-平面;1-边框;2-3D_Down;3-3D_Up;4-3D_Auto~sta=1 |
| `borderc` | Color | 0 | 0..65535 | yes | 边框颜色~style=1 |
| `borderw` | UU8 | 2 | 0..255 | yes | 边框粗细,最大值:255~style=1 |
| `font` | Fontid | 0 | 0..255 | yes | 字库 |
| `pic` | Picid | 65535 | 0..65535 | yes | 默认背景图片~sta=2 |
| `picc` | Picid | 65535 | 0..65535 | yes | 默认切图背景(必须是全屏图片)~sta=0 |
| `bco` | Color | 50712 | 0..65535 | yes | 默认背景色~sta=1 |
| `pic2` | Picid | 65535 | 0..65535 | yes | 按下背景图片~sta=2 |
| `picc2` | Picid | 65535 | 0..65535 | yes | 按下切图背景(必须是全屏图片)~sta=0 |
| `bco2` | Color | 1024 | 0..65535 | yes | 按下背景色~sta=1 |
| `pco` | Color | 0 | 0..65535 | yes | 默认字体色 |
| `pco2` | Color | 65535 | 0..65535 | yes | 按下字体色 |
| `xcen` | Select | 1 | 0..2 | yes | 水平对齐:0-靠左;1-居中;2-靠右 |
| `ycen` | Select | 1 | 0..2 | yes | 垂直对齐:0-靠上;1-居中;2-靠下 |
| `txt` | 10 | newtxt | 0..255 | yes | 字符内容 |
| `txt_maxl` | Strlenth | 10 | 0..65534 | no | 字符最大长度(即分配内存空间) |
| `isbr` | Select | 0 | 0..1 | yes | 是否自动换行:0-否;1-是 |
| `spax` | UU8 | 0 | 0..255 | yes | 字符横向间距(最小0,最大255) |
| `spay` | UU8 | 0 | 0..255 | yes | 字符纵向间距(最小0,最大255) |

## qrcode_VP (objtype 133, prefix `VPqr`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `RAM1` | UU16 | 65535 | 4096..65535 | no | 描述地址(HEX格式,非10进制) |
| `VP` | UU16 | 65535 | 0..65535 | no | 变量地址(HEX格式,非10进制) |
| `sta` | Select | 0 | 0..1 | no | 中心LOGO:0-无;1-有 |
| `dis` | UU8 | 8 | 0..255 | yes | 内容边距 |
| `bco` | Color | 65535 | 0..65535 | yes | 背景色 |
| `pco` | Color | 0 | 0..65535 | yes | 前景色 |
| `pic` | Picid | 65535 | 0..65535 | yes | 图片~sta=1 |
| `txt` | 30 | AppData.qrcodedefautstring | 0..255 | yes | 字符内容 |
| `txt_maxl` | Strlenth | 30 | 0..630 | no | 字符最大长度(即分配内存空间:0-630) |

## TouchMS_VP (objtype 134, prefix `VPtms`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `up` | Hex16 | 65535 | 0..65535 | yes | 按键定义(HEX格式,非十进制) |
| `sta` | Select | 3 | 0..3 | no | 背景填充方式:0-切图;1-单色;2-图片;3-透明 |
| `pic` | Picid | 65535 | 0..65535 | yes | 默认背景图片~sta=2 |
| `picc` | Picid | 65535 | 0..65535 | yes | 默认切图背景(必须是全屏图片)~sta=0 |
| `bco` | Color | 50712 | 0..65535 | yes | 默认背景色~sta=1 |
| `pic2` | Picid | 65535 | 0..65535 | yes | 按下背景图片~sta=2 |
| `picc2` | Picid | 65535 | 0..65535 | yes | 按下切图背景(必须是全屏图片)~sta=0 |
| `bco2` | Color | 1024 | 0..65535 | yes | 按下背景色~sta=1 |

## TouchMenu_VP (objtype 135, prefix `VPtne`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `sta` | Select | 3 | 0..3 | no | 背景填充方式:0-切图;1-单色;2-图片;3-透明 |
| `pic` | Picid | 65535 | 0..65535 | yes | 默认背景图片~sta=2 |
| `picc` | Picid | 65535 | 0..65535 | yes | 默认切图背景(必须是全屏图片)~sta=0 |
| `bco` | Color | 50712 | 0..65535 | yes | 默认背景色~sta=1 |
| `pic2` | Picid | 65535 | 0..65535 | yes | 按下背景图片~sta=2 |
| `picc2` | Picid | 65535 | 0..65535 | yes | 按下切图背景(必须是全屏图片)~sta=0 |
| `bco2` | Color | 1024 | 0..65535 | yes | 按下背景色~sta=1 |
| `VP` | UU16 | 65535 | 0..65535 | yes | 变量地址(HEX格式,非10进制) |
| `mode` | Select | 0 | 0..6 | yes | 数据类型:0-s16(16位有符号整数);1-s32(32位有符号整数);2-u8h(寄存器高8位);3-u8l(寄存器低8位);5-u16(16位无符号整数);6-u32(32位无符号整数) |
| `up` | Select | 1 | 0..1 | yes | 修改后是否上传数据到串口:0-不上传;1-要上传; |
| `key` | Pageid | 255 | 0..255 | no | 菜单页面ID(255为无效) |
| `dir` | Sstr | 0,0,0,0 | 0..int.MaxValue | no | 键盘区域定义(数字顺序依次为键盘页的posx,posy,width,heigth) |
| `pos` | Sstr | 0,0 | 0..int.MaxValue | no | 弹出位置 |

## Movepic_VP (objtype 136, prefix `VPmp`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `RAM1` | UU16 | 65535 | 4096..65535 | no | 描述地址(HEX格式,非10进制) |
| `VP` | UU16 | 65535 | 0..65535 | no | 变量地址(HEX格式,非10进制) |
| `en` | UU16 | 0 | 0..65535 | yes | 播放使能 |
| `stopval` | UU16 | 0 | 0..65535 | yes | 停止值(en为该值时停止播放) |
| `playval` | UU16 | 1 | 0..65535 | yes | 播放值(en为该值时开始播放) |
| `starpic` | Picid | 65535 | 0..65535 | yes | 播放开始图标 |
| `endpic` | Picid | 65535 | 0..65535 | yes | 播放结束图标 |
| `loop` | Select | 1 | 0..1 | yes | 循环播放:0-否;1-是 |
| `stopmode` | Select | 0 | 0..1 | yes | 停止模式:0-停止后显示当前图标;1-停止后回到指定图标 |
| `stoppic` | Picid | 65535 | 0..65535 | yes | 停止后的指定图标(设置65535为无效)~stopmode=1 |
| `sta` | Select | 0 | 0..1 | yes | 滤除背景:0-不滤除;1-要滤除 |
| `tim` | UU16 | 100 | 0..65535 | yes | 播放间隔时间(单位:ms) |

## Curve_VP (objtype 137, prefix `VPqc`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `RAM1` | UU16 | 65535 | 4096..65535 | no | 描述地址(HEX格式,非10进制) |
| `mode` | Select | 0 | 0..1 | yes | 移动模式:0-最新的数据在最右侧;1-最新的数据在最左侧 |
| `vvs0` | UU16 | 0 | 0..65535 | yes | 曲线中心轴位置(相对曲线控件底部向上的偏移量，一般设置0) |
| `val` | UU16 | 0 | 0..65535 | yes | 中心轴对应的曲线数据值(此值对应的曲线将显示在中心轴位置，一般设置0) |
| `pco` | Color | 1024 | 0..65535 | yes | 曲线颜色 |
| `dis` | UU16 | 256 | 0..32767 | yes | 纵轴放大倍数,单位是 1/256 |
| `ch` | UU8 | 0 | 0..7 | yes | 数据源通道 |
| `vvs1` | UU8 | 1 | 1..255 | yes | 横轴间隔 |

## JPEG_VP (objtype 138, prefix `VPjpg`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `RAM1` | UU16 | 65535 | 4096..65535 | no | 描述地址(HEX格式,非10进制) |
| `VP` | UU16 | 65535 | 0..65535 | no | 变量地址(HEX格式,非10进制) |
| `dis` | UU8 | 255 | 0..255 | yes | 亮度(0-255) |
| `sta` | Select | 0 | 0..1 | yes | 滤除背景:0-不滤除;1-要滤除 |

## Dra_VP (objtype 139, prefix `VPdra`)

| attribute | type | default | min..max | runtime | description |
|---|---|---|---|---|---|
| `RAM1` | UU16 | 65535 | 4096..65535 | no | 描述地址(HEX格式,非10进制) |
| `VP` | UU16 | 65535 | 0..65535 | no | 变量地址(HEX格式,非10进制) |
| `dis` | UU8 | 255 | 0..255 | yes | 亮度(0-255) |
| `sta` | Select | 0 | 0..1 | yes | 滤除背景:0-不滤除;1-要滤除 |
