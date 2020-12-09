import {Constants} from "../constants";
import {isChrome} from "./compatibility";
import {hasClosestBlock, hasClosestByClassName} from "./hasClosest";
import {diff_match_patch} from "diff-match-patch";

export const getEditorRange = (element: HTMLElement) => {
    let range: Range;
    if (getSelection().rangeCount > 0) {
        range = getSelection().getRangeAt(0);
        if (element.isEqualNode(range.startContainer) || element.contains(range.startContainer)) {
            return range;
        }
    }
    element.focus();
    range = element.ownerDocument.createRange();
    range.setStart(element, 0);
    range.collapse(true);
    return range;
};

export const setCursorByMD = (cursorPositon:number, editor: HTMLElement) => {
    if(cursorPositon < 0){
        return;
    }
    // 遍历寻找光标所在的NODE
    // 先找顶层
    let index = 0; // 就是所在的element
    let leftNum = cursorPositon;
    while(leftNum > 0){
        leftNum -= editor.childNodes.item(index).textContent.length;
        index += 1;
    }
    // 调整index和offset
    let offset = 0;
    if(leftNum < 0){
        index -= 1;
        offset = leftNum + editor.childNodes.item(index).textContent.length;
    }
    // 获取node
    const nodeInfo = getNode(editor.childNodes.item(index), offset);
    if(nodeInfo.node !== null){
        let newRange = document.createRange();
        newRange.setStart(nodeInfo.node, nodeInfo.offset);
        newRange.collapse(true);
        setSelectionFocus(newRange);
    }
}
interface nodeType {
    node: Node,
    offset: number
}
interface getNodeType {
    (parentNode: Node, offset: number):nodeType
}
const getNode:getNodeType = (parentNode: Node, offset: number)=>{
    let node = null;
    if(parentNode.hasChildNodes()){
        const childNodes:any = parentNode.childNodes;
        for(const child of childNodes){
            if(child.textContent.length < offset){
                offset -= child.textContent.length;
                continue;
            }else{
                const childResult = getNode(child, offset);
                node = childResult.node;
                offset = childResult.offset;
                break;
            }
        }
    }else{
        node = parentNode;
    }
    return {node, offset}
}

export const getCursorInMD = (vditor: IVditor, editor: HTMLElement) => {
    let charNumber = 0;// 从文本头到Cursor的字符个数
    // 获取cursor处节点
    const selection = window.getSelection();
    if(selection.rangeCount === 0){
        return {};
    }
    const range = selection.getRangeAt(0);
    // 首先获取嵌套级数
    let depth = 0;
    let rangeParent = range.startContainer;
    if(rangeParent !== editor){
        while(rangeParent.parentElement !== editor){
            depth += 1;
            rangeParent = rangeParent.parentElement;
        }
    }
    console.log("DEPTH",depth);
    // 获取在html中的索引
    let elementIndex = -1;// 获取顶级索引
    try{
        editor.childNodes.forEach((value,key)=>{
            console.log(value,key);
            if(editor.childNodes.item(key) === rangeParent){
                elementIndex = key;
                throw new Error("Quit foreach");
            }
        });
    }
    catch(e) {
        console.log(e)
    }
    if(elementIndex>-1){// 存在
        // 第一步：获取之前的字符和
        let index = 0;
        while(index < elementIndex){
            charNumber += editor.childNodes.item(index).textContent.length;
            console.log("+", editor.childNodes.item(index).textContent);
            index += 1;
        }
        // 第二步:获取本div的字符和
        console.log(editor.childNodes.item(elementIndex));
        const {number} = getNumber(editor.childNodes.item(elementIndex), range.startContainer,range.startOffset);
        charNumber += number;
    }else{
        return {};
    }

    console.log("NUMBERS FROM HEAD",charNumber);
    return charNumber;
}

interface numberType {
    number: number,
    found: boolean
}
interface getNumberType {
    (sourceNode: Node, distNode: Node, offset:number):numberType
}
/**
 * 获取本DIV中的字符个数
 * @param sourceNode 
 * @param distNode 
 * @param offset 
 */
const getNumber:getNumberType = (sourceNode: Node, distNode: Node, offset:number)=> {
    let numberInfo:numberType={
        number:0,
        found:false
    };
    if(sourceNode.hasChildNodes()){  // 如果有子节点，判断子节点
        const childNodes:any = sourceNode.childNodes;
        for(const child of childNodes){
            const childNumber= getNumber(child, distNode, offset);
            numberInfo.number += childNumber.number;
            console.log("+1", child.textContent,childNumber.number);
            if(childNumber.found){
                numberInfo.found = true;
                break;
            }
        }
    }else if(sourceNode === distNode){
        numberInfo.number += offset;
        console.log("+2", distNode.textContent, offset);
        numberInfo.found = true;
    }else{
        numberInfo.number += sourceNode.textContent.length;
        console.log("+3", sourceNode.textContent);
    }
    return numberInfo;
}

interface selectionPosition {
    left: number,
    top: number
}

export interface selectionOldInfo  {
    rangeEndContainer: Node,
    rangeEndOffset: number,
    rangeEndContainerPositon:selectionPosition
}

export const getSelectionInfo = (editor: HTMLElement)=> {
    const selection = window.getSelection();
    if(selection.rangeCount === 0){
        return {};
    }
    const range = selection.getRangeAt(0);
    const parentRect = editor.parentElement.getBoundingClientRect();
    // 获取endContainer和endOffset的值
    let cursorRect = range.getClientRects()[0] || parentRect;
    return {
        rangeEndContainer: range.endContainer,
        rangeEndOffset: range.endOffset,
        rangeEndContainerPositon: {
            left: cursorRect.left - parentRect.left,
            top: cursorRect.top - parentRect.top,
        }
    }
}

var sonDistance = 0;
var noneDistance = 0;
var equalCharsSum = 0;

export const setSelectionByOldinfo = (editor: HTMLElement, oldInfo:selectionOldInfo)=>{
    //优先级：父子都相同》父相同》子相同
    // 首先判断parentElement内容是否相同
    // 然后再同步判断node是否相同，遇到父子都相同的
    //var newRange = document.createRange();
    var newRangePriority: (Range|unknown)[] = [];
    // positon
    const parentRect = editor.parentElement.getBoundingClientRect();
    var oldDistance = oldInfo.rangeEndContainerPositon.top * parentRect.width + oldInfo.rangeEndContainerPositon.left;
    sonDistance = 0;
    noneDistance = 0;
    equalCharsSum = 0;
    if(editor.childElementCount > 0){
        var tmp:diff_match_patch = new diff_match_patch();
        parseSonNode(editor,newRangePriority,oldDistance,oldInfo,parentRect,tmp);
    }
    console.log(newRangePriority);
    for(const NR_index in newRangePriority){
        console.log("NR INDEX",NR_index);
        const NR = newRangePriority[NR_index];
        if(NR instanceof Range){
            NR.collapse(true);
            setSelectionFocus(NR);
            return;
        }
    }
}

const parseSonNode = (grandSonNode: Node, 
    newRangePriority:any[],oldDistance:number,oldInfo:selectionOldInfo,
    parentRect:DOMRect,tmp:diff_match_patch) => {
    if(!grandSonNode.hasChildNodes()){
        let sonNode = grandSonNode.parentElement;
        if(sonNode.textContent === oldInfo.rangeEndContainer.parentElement.textContent){
            const index =  grandSonNode.textContent.indexOf(oldInfo.rangeEndContainer.textContent);
            if(grandSonNode.textContent === oldInfo.rangeEndContainer.textContent){
                let newRange = document.createRange();
                console.log("LEVEL 0",grandSonNode.textContent,grandSonNode.hasChildNodes());
                newRange.setStart(grandSonNode,oldInfo.rangeEndOffset);
                newRangePriority[0] = newRange;
            }else if(index>-1){
                let newRange = document.createRange();
                console.log("LEVEL 1",grandSonNode.textContent,grandSonNode.hasChildNodes());
                newRange.setStart(grandSonNode, oldInfo.rangeEndOffset + index);
                newRangePriority[1] = newRange;
            }
        }
        else if(sonNode.textContent.indexOf(oldInfo.rangeEndContainer.parentElement.textContent)>-1){
            const index =  grandSonNode.textContent.indexOf(oldInfo.rangeEndContainer.textContent);
            if( index > -1){
                let newRange = document.createRange();
                console.log("LEVEL 2",grandSonNode.textContent,grandSonNode.hasChildNodes());
                newRange.setStart(grandSonNode, oldInfo.rangeEndOffset + index);
                newRangePriority[2] = newRange;
            }
        }
        else if(sonNode.textContent.indexOf(oldInfo.rangeEndContainer.textContent.slice(0,oldInfo.rangeEndOffset))>-1){
            const index =  grandSonNode.textContent.indexOf(oldInfo.rangeEndContainer.textContent.slice(0,oldInfo.rangeEndOffset));
            if( index > -1){
                let newRange = document.createRange();
                console.log("LEVEL 3",grandSonNode.textContent,grandSonNode.hasChildNodes());
                newRange.setStart(grandSonNode, oldInfo.rangeEndOffset + index);
                newRangePriority[3] = newRange;
            }
        }else{
            const index =  grandSonNode.textContent.indexOf(oldInfo.rangeEndContainer.textContent);
            const currentParentLocation = grandSonNode.parentElement.getBoundingClientRect();
            const currentDistance = (currentParentLocation.top - parentRect.top)*parentRect.width + (currentParentLocation.left - parentRect.left);
            if( index > -1 && currentDistance <= oldDistance && currentDistance> sonDistance){
                //console.log("4",grandSonNode.textContent, index);
                let newRange = document.createRange();
                console.log("LEVEL 4",grandSonNode.textContent,grandSonNode.hasChildNodes());
                newRange.setStart(grandSonNode, oldInfo.rangeEndOffset + index);
                newRangePriority[4] = newRange;
                sonDistance = currentDistance;
            }else {
                // diff假设只修改一处地方
                const diffdata = tmp.diff_main( oldInfo.rangeEndContainer.textContent, grandSonNode.textContent,true);
                //console.log(diffdata);
                //比较相同的地方
                let currentEqualCharsSum = 0;
                let leaveNumber = oldInfo.rangeEndOffset;
                let offset = 0;
                diffdata.forEach((df,index) => {
                    if(df[0] === 0 && leaveNumber > 0){
                        currentEqualCharsSum += df[1].length;
                        offset += Math.min(leaveNumber,df[1].length);
                        leaveNumber -= df[1].length;
                    }else if(df[0] === -1 && leaveNumber > 0){
                        leaveNumber -= df[1].length;
                    }else if(df[0] === 1 && leaveNumber > 0){
                        offset += df[1].length;
                    }
                    console.log(df, offset);
                });
                if(currentEqualCharsSum > equalCharsSum){
                    console.log(grandSonNode.textContent, offset);
                    let newRange = document.createRange();
                    console.log("LEVEL 5",grandSonNode.textContent,grandSonNode.hasChildNodes());
                    newRange.setStart(grandSonNode, offset);
                    newRangePriority[5] = newRange;
                    equalCharsSum = currentEqualCharsSum;
                }else if(currentDistance <= oldDistance && currentDistance> noneDistance){ // 父不包含，子也不包含,比较比较距离
                    let newRange = document.createRange();
                    console.log("LEVEL 6",grandSonNode.textContent,grandSonNode.hasChildNodes());
                    newRange.setStart(grandSonNode, grandSonNode.textContent.length);
                    newRangePriority[6] = newRange;
                    noneDistance = currentDistance;
                }
            }
        }
    }
    else{
        grandSonNode.childNodes.forEach(element => {
            parseSonNode(element,newRangePriority,oldDistance,oldInfo,parentRect,tmp)
        });
    }
  }

export const getCursorPosition = (editor: HTMLElement) => {
    const range = window.getSelection().getRangeAt(0);
    if (!editor.contains(range.startContainer) && !hasClosestByClassName(range.startContainer, "vditor-panel--none")) {
        return {
            left: 0,
            top: 0,
        };
    }
    const parentRect = editor.parentElement.getBoundingClientRect();
    let cursorRect;
    if (range.getClientRects().length === 0) {
        if (range.startContainer.nodeType === 3) {
            // 空行时，会出现没有 br 的情况，需要根据父元素 <p> 获取位置信息
            const parent = range.startContainer.parentElement;
            if (parent && parent.getClientRects().length > 0) {
                cursorRect = parent.getClientRects()[0];
            } else {
                return {
                    left: 0,
                    top: 0,
                };
            }
        } else {
            const children = (range.startContainer as Element).children;
            if (children[range.startOffset] &&
                children[range.startOffset].getClientRects().length > 0) {
                // markdown 模式回车
                cursorRect = children[range.startOffset].getClientRects()[0];
            } else if (range.startContainer.childNodes.length > 0) {
                // in table or code block
                const cloneRange = range.cloneRange();
                range.selectNode(range.startContainer.childNodes[Math.max(0, range.startOffset - 1)]);
                cursorRect = range.getClientRects()[0];
                range.setEnd(cloneRange.endContainer, cloneRange.endOffset);
                range.setStart(cloneRange.startContainer, cloneRange.startOffset);
            } else {
                cursorRect = (range.startContainer as HTMLElement).getClientRects()[0];
            }
            if (!cursorRect) {
                let parentElement = range.startContainer.childNodes[range.startOffset] as HTMLElement;
                while (!parentElement.getClientRects ||
                (parentElement.getClientRects && parentElement.getClientRects().length === 0)) {
                    parentElement = parentElement.parentElement;
                }
                cursorRect = parentElement.getClientRects()[0];
            }
        }

    } else {
        cursorRect = range.getClientRects()[0];
    }

    return {
        left: cursorRect.left - parentRect.left,
        top: cursorRect.top - parentRect.top,
    };
};

export const selectIsEditor = (editor: HTMLElement, range?: Range) => {
    if (!range) {
        if (getSelection().rangeCount === 0) {
            return false;
        } else {
            range = getSelection().getRangeAt(0);
        }
    }
    const container = range.commonAncestorContainer;

    return editor.isEqualNode(container) || editor.contains(container);
};

export const setSelectionFocus = (range: Range) => {
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
};

export const getSelectPosition = (selectElement: HTMLElement, editorElement: HTMLElement, range?: Range) => {
    const position = {
        end: 0,
        start: 0,
    };

    if (!range) {
        if (getSelection().rangeCount === 0) {
            return position;
        }
        range = window.getSelection().getRangeAt(0);
    }

    if (selectIsEditor(editorElement, range)) {
        const preSelectionRange = range.cloneRange();
        if (selectElement.childNodes[0] && selectElement.childNodes[0].childNodes[0]) {
            preSelectionRange.setStart(selectElement.childNodes[0].childNodes[0], 0);
        } else {
            preSelectionRange.selectNodeContents(selectElement);
        }
        preSelectionRange.setEnd(range.startContainer, range.startOffset);
        position.start = preSelectionRange.toString().length;
        position.end = position.start + range.toString().length;
    }
    return position;
};

export const setSelectionByPosition = (start: number, end: number, editor: HTMLElement) => {
    let charIndex = 0;
    let line = 0;
    let pNode = editor.childNodes[line];
    let foundStart = false;
    let stop = false;
    start = Math.max(0, start);
    end = Math.max(0, end);

    const range = editor.ownerDocument.createRange();
    range.setStart(pNode || editor, 0);
    range.collapse(true);

    while (!stop && pNode) {
        const nextCharIndex = charIndex + pNode.textContent.length;
        if (!foundStart && start >= charIndex && start <= nextCharIndex) {
            if (start === 0) {
                range.setStart(pNode, 0);
            } else {
                if (pNode.childNodes[0].nodeType === 3) {
                    range.setStart(pNode.childNodes[0], start - charIndex);
                } else if (pNode.nextSibling) {
                    range.setStartBefore(pNode.nextSibling);
                } else {
                    range.setStartAfter(pNode);
                }
            }
            foundStart = true;
            if (start === end) {
                stop = true;
                break;
            }
        }
        if (foundStart && end >= charIndex && end <= nextCharIndex) {
            if (end === 0) {
                range.setEnd(pNode, 0);
            } else {
                if (pNode.childNodes[0].nodeType === 3) {
                    range.setEnd(pNode.childNodes[0], end - charIndex);
                } else if (pNode.nextSibling) {
                    range.setEndBefore(pNode.nextSibling);
                } else {
                    range.setEndAfter(pNode);
                }
            }
            stop = true;
        }
        charIndex = nextCharIndex;
        pNode = editor.childNodes[++line];
    }

    if (!stop && editor.childNodes[line - 1]) {
        range.setStartBefore(editor.childNodes[line - 1]);
    }

    setSelectionFocus(range);
    return range;
};

export const setRangeByWbr = (element: HTMLElement, range: Range) => {
    const wbrElement = element.querySelector("wbr");
    if (!wbrElement) {
        return;
    }
    if (!wbrElement.previousElementSibling) {
        if (wbrElement.previousSibling) {
            // text<wbr>
            range.setStart(wbrElement.previousSibling, wbrElement.previousSibling.textContent.length);
        } else if (wbrElement.nextSibling) {
            if (wbrElement.nextSibling.nodeType === 3) {
                // <wbr>text
                range.setStart(wbrElement.nextSibling, 0);
            } else {
                // <wbr><br> https://github.com/Vanessa219/vditor/issues/400
                range.setStartBefore(wbrElement.nextSibling);
            }
        } else {
            // 内容为空
            range.setStart(wbrElement.parentElement, 0);
        }
    } else {
        if (wbrElement.previousElementSibling.isSameNode(wbrElement.previousSibling)) {
            if (wbrElement.previousElementSibling.lastChild) {
                // <em>text</em><wbr>
                range.setStartBefore(wbrElement);
                range.collapse(true);
                setSelectionFocus(range);
                // fix Chrome set range bug: **c**
                if (isChrome() && (wbrElement.previousElementSibling.tagName === "EM" ||
                    wbrElement.previousElementSibling.tagName === "STRONG" ||
                    wbrElement.previousElementSibling.tagName === "S")) {
                    range.insertNode(document.createTextNode(Constants.ZWSP));
                    range.collapse(false);
                }
                wbrElement.remove();
                return;
            } else {
                // <br><wbr>
                range.setStartAfter(wbrElement.previousElementSibling);
            }
        } else {
            // <em>text</em>text<wbr>
            range.setStart(wbrElement.previousSibling, wbrElement.previousSibling.textContent.length);
        }
    }
    range.collapse(true);
    wbrElement.remove();
    setSelectionFocus(range);
};

export const insertHTML = (html: string, vditor: IVditor) => {
    // 使用 lute 方法会添加 p 元素，只有一个 p 元素的时候进行删除
    const tempElement = document.createElement("div");
    tempElement.innerHTML = html;
    const tempBlockElement = tempElement.querySelectorAll("p");
    if (tempBlockElement.length === 1 && !tempBlockElement[0].previousSibling && !tempBlockElement[0].nextSibling &&
        vditor[vditor.currentMode].element.children.length > 0 && tempElement.firstElementChild.tagName === "P") {
        html = tempBlockElement[0].innerHTML.trim();
    }

    const pasteElement = document.createElement("div");
    pasteElement.innerHTML = html;

    const range = getEditorRange(vditor[vditor.currentMode].element);
    if (range.toString() !== "") {
        vditor[vditor.currentMode].preventInput = true;
        document.execCommand("delete", false, "");
    }

    if (pasteElement.firstElementChild &&
        pasteElement.firstElementChild.getAttribute("data-block") === "0") {
        // 粘贴内容为块元素时，应在下一段落中插入
        pasteElement.lastElementChild.insertAdjacentHTML("beforeend", "<wbr>");
        const blockElement = hasClosestBlock(range.startContainer);
        if (!blockElement) {
            vditor[vditor.currentMode].element.insertAdjacentHTML("beforeend", pasteElement.innerHTML);
        } else {
            blockElement.insertAdjacentHTML("afterend", pasteElement.innerHTML);
        }
        setRangeByWbr(vditor[vditor.currentMode].element, range);
    } else {
        const pasteTemplate = document.createElement("template");
        pasteTemplate.innerHTML = html;
        range.insertNode(pasteTemplate.content.cloneNode(true));
        range.collapse(false);
        setSelectionFocus(range);
    }
};
