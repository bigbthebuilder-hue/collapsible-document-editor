import { test, expect } from '@playwright/test';
const seed = { id:'qa', title:'Formatting QA', blocks:[{id:'a',type:'text',content:'Alpha beta gamma delta.\nSecond line.'},{id:'b',type:'collapsible',preview:'Section preview',content:'Expanded section text.',isOpen:true}], versions:[],updatedAt:new Date().toISOString() };
async function select(page,selector,start,end) {
  await page.locator(selector).evaluate((el,{start,end})=>{el.focus();el.setSelectionRange(start,end);el.dispatchEvent(new Event('select',{bubbles:true}));document.dispatchEvent(new Event('selectionchange'));},{start,end});
  await expect(page.getByRole('toolbar',{name:'Selected text formatting'})).toBeVisible();
}
async function action(page,name) {
  const button=page.getByRole('button',{name,exact:true});
  if(await page.evaluate(()=>navigator.maxTouchPoints>0)){const box=await button.boundingBox();await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);}else await button.click();
}
test.beforeEach(async({page})=>{
  await page.addInitScript(doc=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('talk-doc-library-v1',JSON.stringify({qa:doc}));localStorage.setItem('talk-doc-current-id-v1','qa');sessionStorage.setItem('seeded','yes');}},seed);
  page.on('dialog',dialog=>dialog.accept());await page.goto('/');
});
test('selection toolbar toggles both styles and preserves native selection',async({page})=>{
  await select(page,'textarea.text-editor',6,16);
  const before=await page.locator('textarea.text-editor').evaluate(e=>({start:e.selectionStart,end:e.selectionEnd,y:scrollY}));
  await action(page,'Bold');await action(page,'Highlight');
  expect(await page.locator('textarea.text-editor').evaluate(e=>({start:e.selectionStart,end:e.selectionEnd,y:scrollY}))).toEqual(before);
  await expect(page.locator('.format-layer mark strong')).toHaveText('beta gamma');
  await action(page,'Bold');await expect(page.locator('.format-layer strong')).toHaveCount(0);
  await expect(page.locator('.format-layer mark')).toHaveText('beta gamma');
  await action(page,'Highlight');await expect(page.locator('.format-layer mark')).toHaveCount(0);
});
test('replacement across bold/highlight boundaries loses no text',async({page})=>{
  await select(page,'textarea.text-editor',0,10);await action(page,'Bold');
  await select(page,'textarea.text-editor',6,16);await action(page,'Highlight');
  await select(page,'textarea.text-editor',3,19);await page.keyboard.insertText('REPLACED');
  await expect(page.locator('textarea.text-editor')).toHaveValue('AlpREPLACEDlta.\nSecond line.');
  expect(await page.locator('.format-layer').first().textContent()).toBe('AlpREPLACEDlta.\nSecond line.\n');
});
test('autosave, history cap, switching, export/import, Delivery and restoration retain marks',async({page})=>{
  await select(page,'textarea.expanded-editor',0,8);await action(page,'Bold');await action(page,'Highlight');
  await page.waitForTimeout(15500);await page.reload();
  await expect(page.locator('.format-layer mark strong')).toHaveText('Expanded');
  async function menu(name){await page.getByRole('button',{name:/^(Options|Menu)$/}).click();await page.getByRole('button',{name,exact:true}).click();}
  for(let i=0;i<6;i++) await menu('Save version');
  await menu('Previous versions');await expect(page.locator('.version-row')).toHaveCount(5);
  await page.locator('.version-row').first().getByRole('button',{name:'Restore',exact:true}).click();
  await menu('Duplicate file');await menu('Open file');
  await page.locator('.file-row').filter({hasText:'Formatting QA'}).last().getByRole('button').click();
  const downloadPromise=page.waitForEvent('download');await menu('Export Talk Doc');const download=await downloadPromise;
  await page.locator('input[accept=".talk-doc,.collapsible-doc,.json"]').setInputFiles(await download.path());
  await page.getByRole('button',{name:'Deliver',exact:true}).click();
  await expect(page.locator('textarea')).toHaveCount(0);await expect(page.locator('.readonly-text mark strong')).toHaveText('Expanded');
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  await page.locator('.collapse-toggle').click();await expect(page.locator('textarea.expanded-editor')).toHaveCount(0);
  await page.locator('.collapse-toggle').click();await expect(page.locator('.format-layer mark strong')).toHaveText('Expanded');
  await page.locator('.preview-editor').fill('Edited preview');
  await page.getByRole('button',{name:'Section options',exact:true}).click();await page.getByRole('button',{name:'Restore to normal text',exact:true}).click();
  await expect(page.locator('.format-layer mark strong')).toHaveText('Expanded');
  await expect(page.locator('textarea.text-editor').last()).toHaveValue('Expanded section text.');
});
test('long-document typing and formatting keep cursor and document scroll stable',async({page})=>{
  const el=page.locator('textarea.text-editor');await el.fill(Array.from({length:200},(_,i)=>`Line ${i} document text.`).join('\n'));
  await el.evaluate(e=>{e.focus();const start=e.value.indexOf('Line 90');e.setSelectionRange(start,start+7);window.scrollTo(0,e.getBoundingClientRect().top+scrollY+2200);e.dispatchEvent(new Event('select',{bubbles:true}));document.dispatchEvent(new Event('selectionchange'));});
  const before=await el.evaluate(e=>({y:scrollY,start:e.selectionStart,end:e.selectionEnd,height:e.clientHeight}));
  await action(page,'Bold');expect(await el.evaluate(e=>({y:scrollY,start:e.selectionStart,end:e.selectionEnd,height:e.clientHeight}))).toEqual(before);
  await el.evaluate(e=>{e.setSelectionRange(e.selectionStart,e.selectionStart);});
  // Place viewport around the native caret before typing, as a tap would do.
  await el.press('ArrowRight');const y=await page.evaluate(()=>scrollY);const p=await el.evaluate(e=>e.selectionStart);
  await page.keyboard.insertText('X');expect(await el.evaluate(e=>e.selectionStart)).toBe(p+1);expect(await page.evaluate(()=>scrollY)).toBe(y);
  await el.press('ControlOrMeta+End');const height=await el.evaluate(e=>e.clientHeight);await page.keyboard.insertText('\nNew bottom line');expect(await el.evaluate(e=>e.clientHeight)).toBeGreaterThan(height);
});
test('HTML import/export is formatted and inert',async({page})=>{
  await page.locator('input[accept=".docx,.txt,.md,.html"]').setInputFiles({name:'safe.html',mimeType:'text/html',buffer:Buffer.from('<p>Hello <strong>bold</strong> and <mark>yellow</mark>&lt;img onerror=alert(1)&gt;<script>alert(1)</script></p>')});
  await expect(page.locator('.format-layer strong')).toHaveText('bold');await expect(page.locator('.format-layer mark')).toHaveText('yellow');
  await expect(page.locator('.document-page img')).toHaveCount(0);
});
test('formatting survives making selected words collapsible without trimming characters',async({page})=>{
  await select(page,'textarea.text-editor',0,16);await action(page,'Bold');
  await select(page,'textarea.text-editor',6,16);await action(page,'Highlight');
  await page.getByRole('button',{name:/^(Make collapsible|Collapse)$/}).click();
  await page.locator('.collapse-toggle').first().click();
  await expect(page.locator('textarea.expanded-editor').first()).toHaveValue('beta gamma');
  await expect(page.locator('.format-layer mark strong').first()).toHaveText('beta gamma');
  const allText=await page.locator('textarea.text-editor, textarea.expanded-editor').evaluateAll(es=>es.map(e=>e.value).join(''));
  expect(allText).toBe(seed.blocks.map(b=>b.content).join(''));
});
