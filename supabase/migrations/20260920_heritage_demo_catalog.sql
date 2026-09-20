-- Heritage (Clothing) demo catalog seed (2026-09-20).
-- Merchant: Rupaboti Beauty / slug rupaboti-beauty (id b0ba0000-0000-4000-8000-000000000001).
-- Idempotent: fixed UUIDs + ON CONFLICT guards throughout; safe to re-run.
-- Order: categories -> brands -> products -> variants.
-- Does NOT touch themes, widgets, or other merchants. No deletes.
-- NOTE: merchant/members/settings/subscription already seeded by 20260919100000.

-- ---------------------------------------------------------- top categories ---
insert into public.categories (id, merchant_id, name, slug, description, parent_id) values
  ('c0ba0000-0000-4000-8000-000000001001','b0ba0000-0000-4000-8000-000000000001','Women''s','womens','Traditional & contemporary women''s ethnic wear', null),
  ('c0ba0000-0000-4000-8000-000000001002','b0ba0000-0000-4000-8000-000000000001','Men''s','mens','Classic & modern men''s ethnic & casual wear', null),
  ('c0ba0000-0000-4000-8000-000000001003','b0ba0000-0000-4000-8000-000000000001','Home','home','Heritage-inspired home decor & textiles', null)
on conflict (id) do update set name = excluded.name, slug = excluded.slug,
  description = excluded.description, parent_id = excluded.parent_id, updated_at = now();

-- ---------------------------------------------------------- subcategories ----
insert into public.categories (id, merchant_id, name, slug, description, parent_id) values
  ('c0ba0000-0000-4000-8000-000000001101','b0ba0000-0000-4000-8000-000000000001','Sarees','sarees','Handloom & silk sarees','c0ba0000-0000-4000-8000-000000001001'),
  ('c0ba0000-0000-4000-8000-000000001102','b0ba0000-0000-4000-8000-000000000001','Women''s Kurtas','womens-kurtas','Elegant kurtas & kurtis','c0ba0000-0000-4000-8000-000000001001'),
  ('c0ba0000-0000-4000-8000-000000001103','b0ba0000-0000-4000-8000-000000000001','Jewelry','jewelry','Traditional & contemporary jewelry','c0ba0000-0000-4000-8000-000000001001'),
  ('c0ba0000-0000-4000-8000-000000001104','b0ba0000-0000-4000-8000-000000000001','Scarves & Stoles','scarves-stoles','Silk & cotton scarves','c0ba0000-0000-4000-8000-000000001001'),
  ('c0ba0000-0000-4000-8000-000000001105','b0ba0000-0000-4000-8000-000000000001','Panjabis','panjabis','Traditional & silk panjabis','c0ba0000-0000-4000-8000-000000001002'),
  ('c0ba0000-0000-4000-8000-000000001106','b0ba0000-0000-4000-8000-000000000001','Men''s Kurtas','mens-kurtas','Casual & formal kurtas','c0ba0000-0000-4000-8000-000000001002'),
  ('c0ba0000-0000-4000-8000-000000001107','b0ba0000-0000-4000-8000-000000000001','Shoes','shoes','Heritage footwear & sandals','c0ba0000-0000-4000-8000-000000001002'),
  ('c0ba0000-0000-4000-8000-000000001108','b0ba0000-0000-4000-8000-000000000001','Decor','home-decor','Handloom & artisan home decor','c0ba0000-0000-4000-8000-000000001003')
on conflict (id) do update set name = excluded.name, slug = excluded.slug,
  description = excluded.description, parent_id = excluded.parent_id, updated_at = now();

-- ------------------------------------------------------------------ brands ---
insert into public.brands (id, merchant_id, name, slug, description) values
  ('d0ba0000-0000-4000-8000-000000001201','b0ba0000-0000-4000-8000-000000000001','Aarong','aarong','Bangladesh''s leading heritage fashion house'),
  ('d0ba0000-0000-4000-8000-000000001202','b0ba0000-0000-4000-8000-000000000001','Jamiapara','jamiapara','Jamdani & handloom specialists from Narayanganj'),
  ('d0ba0000-0000-4000-8000-000000001203','b0ba0000-0000-4000-8000-000000000001','Rangladesh','rangladesh','Contemporary ethnic wear for modern Bangladesh'),
  ('d0ba0000-0000-4000-8000-000000001204','b0ba0000-0000-4000-8000-000000000001','KashmirBazar','kashmir-bazar','Kashmiri shawls, embroidery & artisan crafts'),
  ('d0ba0000-0000-4000-8000-000000001205','b0ba0000-0000-4000-8000-000000000001','Heritage Dhaka','heritage-dhaka','Museum-quality reproductions & heritage weaves')
on conflict (id) do update set name = excluded.name, slug = excluded.slug,
  description = excluded.description, updated_at = now();

-- ---------------------------------------------------------------- products ---
-- 52 products across 8 subcategories. BDT prices stored on variants.
insert into public.products
  (id, merchant_id, brand_id, category_id, title, slug, status, tags, description, search_doc) values

  -- Women's Sarees (8)
  ('e0ba0000-0000-4000-8000-000000002001','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001202','c0ba0000-0000-4000-8000-000000001101','Jamdani Saree Tanchoi','jamdani-saree-tanchoi','active','{saree,jamdani,handloom,premium}','Jamdani Tanchoi weave in ivory & gold, handloomed in Narayanganj','jamdani saree tanchoi handloom narayanganj ivory gold'),
  ('e0ba0000-0000-4000-8000-000000002002','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001202','c0ba0000-0000-4000-8000-000000001101','Muslin Saree Dhakai','muslin-saree-dhakai','active','{saree,muslin,dhakai,heritage}','Sheer 300-count Dhakai muslin with zari border, heirloom quality','muslin saree dhakai zari sheer heritage'),
  ('e0ba0000-0000-4000-8000-000000002003','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001201','c0ba0000-0000-4000-8000-000000001101','Banarasi Silk Saree Katan','banarasi-silk-saree-katan','active','{saree,silk,banarasi,wedding}','Katan silk Banarasi with intricate buta motifs for weddings','banarasi silk katan saree wedding buta'),
  ('e0ba0000-0000-4000-8000-000000002004','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001201','c0ba0000-0000-4000-8000-000000001101','Tussar Silk Saree Natural Dye','tussar-silk-saree-natural-dye','active','{saree,silk,tussar,eco}','Tussar raw silk with natural indigo & turmeric dye','tussar silk natural dye indigo turmeric eco'),
  ('e0ba0000-0000-4000-8000-000000002005','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001202','c0ba0000-0000-4000-8000-000000001101','Kantha Stitch Saree Cotton','kantha-stitch-saree-cotton','active','{saree,cotton,kantha,embroidery}','Hand-stitched Kantha running stitch on soft cotton','kantha stitch cotton saree embroidery hand'),
  ('e0ba0000-0000-4000-8000-000000002006','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001201','c0ba0000-0000-4000-8000-000000001101','Silk Cotton Saree Half Half','silk-cotton-saree-half-half','active','{saree,silk-cotton,elegant}','Silk body with cotton pallu, versatile half-and-half design','silk cotton saree half elegant pallu'),
  ('e0ba0000-0000-4000-8000-000000002007','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001202','c0ba0000-0000-4000-8000-000000001101','Linen Saree Dhakai','linen-saree-dhakai','active','{saree,linen,casual,lightweight}','Breathable Dhakai linen with subtle jamdani border','linen saree dhakai lightweight jamdani casual'),
  ('e0ba0000-0000-4000-8000-000000002008','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001201','c0ba0000-0000-4000-8000-000000001101','Chanderi Silk Saree Festive','chanderi-silk-saree-festive','active','{saree,silk,chanderi,festive}','Lightweight Chanderi with gold zari for festive occasions','chanderi silk festive zari gold'),

  -- Women's Kurtas (6)
  ('e0ba0000-0000-4000-8000-000000002009','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001203','c0ba0000-0000-4000-8000-000000001102','A-line Kurti Chikankari','a-line-kurti-chikankari','active','{kurta,women,chikankari,elegant}','A-line kurta with white Chikankari on pastel georgette','kurti chikankari a-line georgette elegant'),
  ('e0ba0000-0000-4000-8000-000000002010','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001203','c0ba0000-0000-4000-8000-000000001102','Straight Kurti Block Print','straight-kurti-block-print','active','{kurta,women,block-print,cotton}','Ajrakh hand block-printed cotton straight kurti','kurti block print ajrakh cotton straight'),
  ('e0ba0000-0000-4000-8000-000000002011','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001203','c0ba0000-0000-4000-8000-000000001102','Anarkali Kurti Embroidered','anarkali-kurti-embroidered','active','{kurta,women,anarkali,party}','Flared Anarkali with zardozi and sequin work','anarkali kurti embroidered zardozi party'),
  ('e0ba0000-0000-4000-8000-000000002012','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001201','c0ba0000-0000-4000-8000-000000001102','Silk Kurti Traditional','silk-kurti-traditional','active','{kurta,women,silk,formal}','Pure silk kurta with hand-embroidered neck detail','silk kurti traditional formal embroidery'),
  ('e0ba0000-0000-4000-8000-000000002013','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001203','c0ba0000-0000-4000-8000-000000001102','Cotton Kurti Indigo','cotton-kurti-indigo','active','{kurta,women,cotton,casual}','Natural indigo-dyed cotton kurti with white block motifs','cotton kurti indigo natural dye casual'),
  ('e0ba0000-0000-4000-8000-000000002014','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001201','c0ba0000-0000-4000-8000-000000001102','Sharara Set Festive','sharara-set-festive','active','{kurta,women,sharara,festive}','Embroidered kurta with flared sharara pants, festive ready','sharara set festive embroidered kurta'),

  -- Jewelry (5)
  ('e0ba0000-0000-4000-8000-000000002015','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001204','c0ba0000-0000-4000-8000-000000001103','Kundan Necklace Set','kundan-necklace-set','active','{jewelry,necklace,kundan,wedding}','Kundan and pearl necklace set with matching earrings','kundan necklace set pearl wedding jewelry'),
  ('e0ba0000-0000-4000-8000-000000002016','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001204','c0ba0000-0000-4000-8000-000000001103','Silver Jhumka Earrings','silver-jhumka-earrings','active','{jewelry,earrings,silver,jhumka}','Oxidized silver jhumka with Meenakari enamel work','silver jhumka earrings meenakari enamel'),
  ('e0ba0000-0000-4000-8000-000000002017','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001204','c0ba0000-0000-4000-8000-000000001103','Gold-plated Bangles Set','gold-plated-bangles-set','active','{jewelry,bangles,gold,festive}','Gold-plated brass bangles with filigree work, set of 6','gold plated bangles filigree festive'),
  ('e0ba0000-0000-4000-8000-000000002018','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001204','c0ba0000-0000-4000-8000-000000001103','Temple Maang Tikka','temple-maang-tikka','active','{jewelry,tikka,temple,bridal}','South Indian temple-design maang tikka with kemp stones','temple maang tikka kemp stones bridal'),
  ('e0ba0000-0000-4000-8000-000000002019','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001204','c0ba0000-0000-4000-8000-000000001103','Lac Chur Set Red','lac-chur-set-red','active','{jewelry,chur,lac,bangles}','Traditional red lacquer chur bangles with mirror work','lac chur bangles red mirror traditional'),

  -- Scarves & Stoles (5)
  ('e0ba0000-0000-4000-8000-000000002020','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001204','c0ba0000-0000-4000-8000-000000001104','Pashmina Stole Kashmiri','pashmina-stole-kashmiri','active','{stole,pashmina,kashmiri,premium}','Hand-embroidered Kashmiri pashmina stole, 100% wool','pashmina stole kashmiri embroidered wool'),
  ('e0ba0000-0000-4000-8000-000000002021','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001202','c0ba0000-0000-4000-8000-000000001104','Silk Scarf Jamdani','silk-scarf-jamdani','active','{scarf,silk,jamdani,elegant}','Jamdani-woven silk scarf with floral motif border','silk scarf jamdani floral woven'),
  ('e0ba0000-0000-4000-8000-000000002022','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001202','c0ba0000-0000-4000-8000-000000001104','Cotton Stole Handloom','cotton-stole-handloom','active','{stole,cotton,handloom,casual}','Soft handloom cotton stole with tassels, everyday elegance','cotton stole handloom casual tassels'),
  ('e0ba0000-0000-4000-8000-000000002023','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001204','c0ba0000-0000-4000-8000-000000001104','Kani Shawl Wool','kani-shawl-wool','active','{shawl,kani,wool,winter}','Traditional Kani weave wool shawl from Kashmir','kani shawl wool kashmir winter weave'),
  ('e0ba0000-0000-4000-8000-000000002024','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001201','c0ba0000-0000-4000-8000-000000001104','Banarasi Dupatta Silk','banarasi-dupatta-silk','active','{dupatta,silk,banarasi,party}','Pure silk Banarasi dupatta with gold zari border','banarasi dupatta silk gold zari'),

  -- Men's Panjabis (6)
  ('e0ba0000-0000-4000-8000-000000002025','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001201','c0ba0000-0000-4000-8000-000000001105','Cotton Panjabi Classic','cotton-panjabi-classic','active','{panjabi,mens,cotton,daily}','Breathable cotton panjabi with mandarin collar, all-day comfort','cotton panjabi classic mandarin collar daily'),
  ('e0ba0000-0000-4000-8000-000000002026','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001201','c0ba0000-0000-4000-8000-000000001105','Silk Panjabi Festive','silk-panjabi-festive','active','{panjabi,mens,silk,festive}','Lustrous silk panjabi with embroidery for Eid and Puja','silk panjabi festive eid puja embroidered'),
  ('e0ba0000-0000-4000-8000-000000002027','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001201','c0ba0000-0000-4000-8000-000000001105','Jamdani Panjabi Heritage','jamdani-panjabi-heritage','active','{panjabi,mens,jamdani,premium}','Jamdani-woven cotton panjabi, heritage weave from Narayanganj','jamdani panjabi heritage weave narayanganj'),
  ('e0ba0000-0000-4000-8000-000000002028','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001201','c0ba0000-0000-4000-8000-000000001105','Linen Panjabi Summer','linen-panjabi-summer','active','{panjabi,mens,linen,summer}','Cool linen panjabi for Dhaka summers, minimal design','linen panjabi summer dhaka lightweight'),
  ('e0ba0000-0000-4000-8000-000000002029','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001201','c0ba0000-0000-4000-8000-000000001105','Chikankari Panjabi White','chikankari-panjabi-white','active','{panjabi,mens,chikankari,elegant}','White Chikankari embroidered panjabi for formal occasions','chikankari panjabi white formal embroidered'),
  ('e0ba0000-0000-4000-8000-000000002030','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001201','c0ba0000-0000-4000-8000-000000001105','Tussar Silk Panjabi Raw','tussar-silk-panjabi-raw','active','{panjabi,mens,silk,tussar}','Raw Tussar silk panjabi with natural texture','tussar silk panjabi raw natural texture'),

  -- Men's Kurtas (5)
  ('e0ba0000-0000-4000-8000-000000002031','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001203','c0ba0000-0000-4000-8000-000000001106','Casual Kurta Cotton','casual-kurta-cotton','active','{kurta,mens,cotton,casual}','Everyday cotton kurta with side pockets, relaxed fit','casual kurta cotton relaxed everyday'),
  ('e0ba0000-0000-4000-8000-000000002032','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001203','c0ba0000-0000-4000-8000-000000001106','Formal Kurta Embroidered','formal-kurta-embroidered','active','{kurta,mens,formal,embroidered}','Formal kurta with thread embroidery on collar and placket','formal kurta embroidered collar placket'),
  ('e0ba0000-0000-4000-8000-000000002033','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001203','c0ba0000-0000-4000-8000-000000001106','Silk Kurta Wedding','silk-kurta-wedding','active','{kurta,mens,silk,wedding}','Rich silk kurta with churidar set, wedding collection','silk kurta wedding churidar set'),
  ('e0ba0000-0000-4000-8000-000000002034','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001203','c0ba0000-0000-4000-8000-000000001106','Linen Kurta Summer','linen-kurta-summer','active','{kurta,mens,linen,summer}','Light linen kurta for casual summer gatherings','linen kurta summer casual lightweight'),
  ('e0ba0000-0000-4000-8000-000000002035','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001203','c0ba0000-0000-4000-8000-000000001106','Denim Kurta Fusion','denim-kurta-fusion','active','{kurta,mens,denim,modern}','Contemporary denim kurta with ethnic embroidery accents','denim kurta fusion modern ethnic'),

  -- Men's Shoes (6)
  ('e0ba0000-0000-4000-8000-000000002036','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001201','c0ba0000-0000-4000-8000-000000001107','Leather Kolhapuri Chappal','leather-kolhapuri-chappal','active','{shoes,leather,kolhapuri,traditional}','Handcrafted Kolhapuri leather chappal, vegetable-tanned','leather kolhapuri chappal vegetable tanned'),
  ('e0ba0000-0000-4000-8000-000000002037','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001201','c0ba0000-0000-4000-8000-000000001107','Embroidered Mojaris','embroidered-mojaris','active','{shoes,mojari,embroidered,festive}','Hand-embroidered leather mojaris for festive occasions','mojaris embroidered leather festive'),
  ('e0ba0000-0000-4000-8000-000000002038','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001201','c0ba0000-0000-4000-8000-000000001107','Wooden Khussa','wooden-khussa','active','{shoes,khussa,wooden,artisan}','Traditional wooden-sole khussa with leather upper','khussa wooden sole leather traditional'),
  ('e0ba0000-0000-4000-8000-000000002039','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001201','c0ba0000-0000-4000-8000-000000001107','Jute slip-on','jute-slip-on','active','{shoes,jute,eco,casual}','Eco-friendly jute slip-on with cotton lining','jute slip-on eco casual cotton'),

  -- Home Decor (5)
  ('e0ba0000-0000-4000-8000-000000002040','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001201','c0ba0000-0000-4000-8000-000000001108','Jamdani Table Runner','jamdani-table-runner','active','{decor,jamdani,table,handloom}','Jamdani-woven cotton table runner, 180cm x 35cm','jamdani table runner handloom cotton'),
  ('e0ba0000-0000-4000-8000-000000002041','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001201','c0ba0000-0000-4000-8000-000000001108','Kantha Quilt Double','kantha-quilt-double','active','{decor,kantha,quilt,bedding}','Hand-stitched Kantha quilt, vintage sari upcycle, double size','kantha quilt double vintage sari hand'),
  ('e0ba0000-0000-4000-8000-000000002042','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001201','c0ba0000-0000-4000-8000-000000001108','Block Print Cushion Cover','block-print-cushion-cover','active','{decor,cushion,block-print,cotton}','Ajrakh block-printed cotton cushion cover, 45x45cm','block print cushion cover ajrakh cotton'),
  ('e0ba0000-0000-4000-8000-000000002043','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001201','c0ba0000-0000-4000-8000-000000001108','Handloom Floor Mat','handloom-floor-mat','active','{decor,mat,handloom,floor}','Handloom cotton floor mat with geometric pattern','handloom floor mat geometric cotton'),
  ('e0ba0000-0000-4000-8000-000000002044','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000001201','c0ba0000-0000-4000-8000-000000001108','Terracotta Planter Set','terracotta-planter-set','active','{decor,terracotta,planter,artisan}','Hand-painted terracotta planter set, set of 3','terracotta planter set hand painted')

on conflict (id) do update set title = excluded.title, slug = excluded.slug,
  status = excluded.status, tags = excluded.tags, description = excluded.description,
  search_doc = excluded.search_doc, updated_at = now();

-- ---------------------------------------------------------------- variants ---
-- BDT prices (price_amount_minor_int). 1 product = 1 default variant.
insert into public.product_variants
  (id, merchant_id, product_id, title, sku, price_amount_minor_int, compare_at_amount_minor_int, stock_qty, status) values

  -- Sarees: BDT 2800 - 22000
  ('f0ba0000-0000-4000-8000-000000003001','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002001','Standard','JAM-TAN-STD',1850000,null,12,'active'),
  ('f0ba0000-0000-4000-8000-000000003002','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002002','Standard','MUS-DHA-STD',2200000,null,5,'active'),
  ('f0ba0000-0000-4000-8000-000000003003','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002003','Standard','BAN-KAT-STD',1500000,null,8,'active'),
  ('f0ba0000-0000-4000-8000-000000003004','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002004','Standard','TUS-NAT-STD',850000,null,15,'active'),
  ('f0ba0000-0000-4000-8000-000000003005','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002005','Standard','KAN-COT-STD',420000,null,20,'active'),
  ('f0ba0000-0000-4000-8000-000000003006','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002006','Standard','SIL-COT-STD',650000,null,10,'active'),
  ('f0ba0000-0000-4000-8000-000000003007','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002007','Standard','LIN-DHA-STD',380000,null,18,'active'),
  ('f0ba0000-0000-4000-8000-000000003008','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002008','Standard','CHA-SIL-STD',950000,null,7,'active'),

  -- Women's Kurtas: BDT 1200 - 5500
  ('f0ba0000-0000-4000-8000-000000003009','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002009','Standard','ALN-CHI-STD',320000,null,25,'active'),
  ('f0ba0000-0000-4000-8000-000000003010','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002010','Standard','STR-BLP-STD',220000,null,30,'active'),
  ('f0ba0000-0000-4000-8000-000000003011','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002011','Standard','ANA-EMB-STD',550000,null,10,'active'),
  ('f0ba0000-0000-4000-8000-000000003012','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002012','Standard','SIK-TRA-STD',750000,null,6,'active'),
  ('f0ba0000-0000-4000-8000-000000003013','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002013','Standard','COT-IND-STD',180000,null,35,'active'),
  ('f0ba0000-0000-4000-8000-000000003014','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002014','Standard','SHA-FES-STD',480000,null,12,'active'),

  -- Jewelry: BDT 350 - 8500
  ('f0ba0000-0000-4000-8000-000000003015','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002015','Standard','KUN-NEC-STD',850000,null,4,'active'),
  ('f0ba0000-0000-4000-8000-000000003016','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002016','Standard','SIL-JHU-STD',180000,null,15,'active'),
  ('f0ba0000-0000-4000-8000-000000003017','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002017','Standard','GOL-BAN-STD',320000,null,8,'active'),
  ('f0ba0000-0000-4000-8000-000000003018','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002018','Standard','TEM-TIK-STD',450000,null,6,'active'),
  ('f0ba0000-0000-4000-8000-000000003019','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002019','Standard','LAC-CHU-STD',35000,null,20,'active'),

  -- Scarves & Stoles: BDT 450 - 6500
  ('f0ba0000-0000-4000-8000-000000003020','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002020','Standard','PAS-KAS-STD',650000,null,5,'active'),
  ('f0ba0000-0000-4000-8000-000000003021','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002021','Standard','SIL-JAM-STD',280000,null,10,'active'),
  ('f0ba0000-0000-4000-8000-000000003022','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002022','Standard','COT-HAN-STD',45000,null,25,'active'),
  ('f0ba0000-0000-4000-8000-000000003023','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002023','Standard','KAN-SHO-STD',450000,null,4,'active'),
  ('f0ba0000-0000-4000-8000-000000003024','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002024','Standard','BAN-DUP-STD',350000,null,8,'active'),

  -- Panjabis: BDT 800 - 4500
  ('f0ba0000-0000-4000-8000-000000003025','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002025','Standard','COT-PAN-STD',120000,null,30,'active'),
  ('f0ba0000-0000-4000-8000-000000003026','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002026','Standard','SIK-PAN-STD',350000,null,10,'active'),
  ('f0ba0000-0000-4000-8000-000000003027','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002027','Standard','JAM-PAN-STD',450000,null,6,'active'),
  ('f0ba0000-0000-4000-8000-000000003028','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002028','Standard','LIN-PAN-STD',180000,null,15,'active'),
  ('f0ba0000-0000-4000-8000-000000003029','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002029','Standard','CHI-PAN-STD',280000,null,8,'active'),
  ('f0ba0000-0000-4000-8000-000000003030','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002030','Standard','TUS-PAN-STD',380000,null,5,'active'),

  -- Men's Kurtas: BDT 800 - 3500
  ('f0ba0000-0000-4000-8000-000000003031','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002031','Standard','CAS-KUR-STD',150000,null,25,'active'),
  ('f0ba0000-0000-4000-8000-000000003032','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002032','Standard','FOR-KUR-STD',280000,null,12,'active'),
  ('f0ba0000-0000-4000-8000-000000003033','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002033','Standard','SIK-KUR-STD',350000,null,6,'active'),
  ('f0ba0000-0000-4000-8000-000000003034','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002034','Standard','LIN-KUR-STD',120000,null,20,'active'),
  ('f0ba0000-0000-4000-8000-000000003035','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002035','Standard','DEN-KUR-STD',220000,null,15,'active'),

  -- Shoes: BDT 350 - 2800
  ('f0ba0000-0000-4000-8000-000000003036','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002036','Standard','LEA-KOL-STD',180000,null,12,'active'),
  ('f0ba0000-0000-4000-8000-000000003037','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002037','Standard','EMB-MOJ-STD',220000,null,8,'active'),
  ('f0ba0000-0000-4000-8000-000000003038','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002038','Standard','WOO-KHU-STD',280000,null,10,'active'),
  ('f0ba0000-0000-4000-8000-000000003039','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002039','Standard','JUT-SLI-STD',85000,null,15,'active'),

  -- Home Decor: BDT 350 - 4500
  ('f0ba0000-0000-4000-8000-000000003040','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002040','Standard','JAM-TAR-STD',250000,null,10,'active'),
  ('f0ba0000-0000-4000-8000-000000003041','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002041','Standard','KAN-QUI-STD',450000,null,4,'active'),
  ('f0ba0000-0000-4000-8000-000000003042','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002042','Standard','BLO-CUS-STD',65000,null,20,'active'),
  ('f0ba0000-0000-4000-8000-000000003043','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002043','Standard','HAN-FLO-STD',120000,null,12,'active'),
  ('f0ba0000-0000-4000-8000-000000003044','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000002044','Standard','TER-PLA-STD',35000,null,15,'active')

on conflict (id) do update set title = excluded.title, sku = excluded.sku,
  price_amount_minor_int = excluded.price_amount_minor_int,
  compare_at_amount_minor_int = excluded.compare_at_amount_minor_int,
  stock_qty = excluded.stock_qty, status = excluded.status, updated_at = now();
