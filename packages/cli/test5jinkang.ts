// 使用switch判断的Node.js示例代码
function getDayDescription(day: number): string {
    let description: string;
    
    switch (day) {
        case 0:
            description = "今天是星期日，休息日";
            break;
        case 1:
            description = "今天是星期一，新的一周开始";
            break;
        case 2:
            description = "今天是星期二，工作继续";
            break;
        case 3:
            description = "今天是星期三，一周过半";
            break;
        case 4:
            description = "今天是星期四，周末不远了";
            break;
        case 5:
            description = "今天是星期五，准备迎接周末";
            break;
        case 6:
            description = "今天是星期六，享受周末时光";
            break;
        default:
            description = "无效的日期，请输入0-6之间的数字";
    }
    
    return description;
}

// 测试代码
const today = new Date().getDay();
console.log(getDayDescription(today));