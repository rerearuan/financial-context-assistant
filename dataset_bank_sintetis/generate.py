import json,csv,calendar,datetime as D, pathlib,zipfile
p=pathlib.Path(__file__).parent
profiles=[]
for kind in ['spending','saving']:
 for level in ['low','high']:
  sid=f'{kind}_{level}'; saving=kind=='saving'; h0=D.date(2026,11,1) if saving else D.date(2026,10,20)
  months=[8,9,10] if saving else [7,8,9]; totals=[2400000,2700000,3000000] if saving else [3800000,4200000,4600000]
  rows=[]
  def add(date,desc,cat,inc=0,out=0): rows.append(dict(date=str(date),description=desc,category=cat,credit=inc,debit=out))
  for month,total in zip(months,totals):
   add(D.date(2026,month,1),'Pendapatan bulanan','income',8000000)
   # 24 transaksi rutin; nominal bervariasi, total tepat, tidak mencakup tagihan khusus.
   weights=[3,2,4,3,2,4]*4; units=total//1000; parts=[units*w//sum(weights)*1000 for w in weights];parts[-1]+=total-sum(parts)
   for i,amt in enumerate(parts): add(D.date(2026,month,i+2),['Makan dan minum','Transportasi','Belanja kebutuhan','Makan dan minum','Kebutuhan pribadi','Belanja kebutuhan'][i%6], 'routine',out=amt)
   if saving:
    for day,desc,cat,amt in [(6,'Pembayaran kartu/BNPL','card_bnpl',600000),(9,'Sewa tempat tinggal','rent',2400000),(15,'Pembayaran utilitas','utilities',500000)]:add(D.date(2026,month,day),desc,cat,out=amt)
   else:add(D.date(2026,month,26),'Pembayaran tagihan khusus bulanan','special_bill',out=1800000)
  if saving:add(h0,'Pendapatan bulanan','income',8000000)
  else:
   add(D.date(2026,10,1),'Pendapatan bulanan','income',8000000)
   for i in range(18):add(D.date(2026,10,i+1),'Kebutuhan rutin bulan berjalan','routine',out=130000 if i<17 else 190000)
  rows.sort(key=lambda r:r['date'])
  final=16000000 if saving and level=='low' else 18000000
  opening=final-sum(r['credit']-r['debit'] for r in rows);balance=opening
  for i,r in enumerate(rows):balance+=r['credit']-r['debit'];r.update(transaction_id=f'{sid}-{i+1:03}',balance=balance);assert balance>=0
  allocations={'emergency':8000000,'operating':8000000} if saving else {'emergency':5000000,'laptop':6000000 if level=='low' else 3000000,'operating':7000000}
  if level=='high':allocations['certification']=2000000 if saving else 3000000
  bills=[dict(id='card',due=str(h0+D.timedelta(days=6)),amount=600000,status='unpaid'),dict(id='rent',due=str(h0+D.timedelta(days=9)),amount=2400000,status='unpaid'),dict(id='utilities',due=None,amount_min=400000,amount_max=600000,status='estimated',period='2026-11')] if saving else [dict(id='special_bill',due=str(h0+D.timedelta(days=6)),amount=1800000,status='unpaid')]
  profile=dict(scenario_id=sid,h0=str(h0),next_income_date=str(D.date(2026,12,1) if saving else D.date(2026,11,1)),monthly_income=8000000,opening_balance=opening,current_balance=final,allocations=allocations,upcoming_bills=bills,history_months=[f'2026-{m:02}' for m in months],routine_monthly_totals=totals,active_action=None,action_options=([1000000,2000000,3000000] if saving else ['cash','installment']),transactions=rows)
  if saving:profile['emergency_target']=12000000
  else:profile['laptop_offer']=dict(price=7000000,regular_price=8500000,installment_months=12,flat_interest_monthly=0.012,admin_rate=0.01,first_payment_date=None,admin_payment_date=None)
  if level=='high':profile['certification_goal']=dict(cost_min=4000000,cost_max=4500000,horizon_months=[2,3])
  assert balance==final and sum(allocations.values())==final
  for m,t in zip(months,totals):assert sum(r['debit'] for r in rows if r['category']=='routine' and r['date'].startswith(f'2026-{m:02}'))==t
  profiles.append(profile)
  with (p/f'{sid}_transactions.csv').open('w') as f:
   w=csv.DictWriter(f,fieldnames=rows[0].keys());w.writeheader();w.writerows(rows)
(p/'scenarios.json').write_text(json.dumps({'schema_version':'1.0','currency':'IDR','synthetic':True,'scenarios':profiles},indent=2))
report=[]
for s in profiles:report.append(dict(scenario=s['scenario_id'],transactions=len(s['transactions']),opening=s['opening_balance'],credits=sum(r['credit'] for r in s['transactions']),debits=sum(r['debit'] for r in s['transactions']),closing=s['current_balance'],allocation_total=sum(s['allocations'].values()),checks='PASS'))
(p/'validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
