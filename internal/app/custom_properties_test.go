package app_test

import "testing"

func TestCustomPropertyScopesAndIndependentVersions(t *testing.T) {
	h, closeDB := setup(t)
	defer closeDB()
	p := req(t, h, "POST", "/projects", object{"title": "Properties"}, 201)
	pid := p["id"].(string)
	other := req(t, h, "POST", "/projects", object{"title": "Other"}, 201)
	makeObject := func(project, typ string) object {
		return req(t, h, "POST", "/projects/"+project+"/"+typ, object{"title": "Object"}, 201)
	}
	a, b := makeObject(pid, "pages"), makeObject(pid, "pages")
	task := makeObject(pid, "tasks")
	foreign := makeObject(other["id"].(string), "pages")
	base := "/projects/" + pid + "/property-definitions/pages"
	d := req(t, h, "POST", base, object{"kind": "text", "request_id": "property-create"}, 201)
	replay := req(t, h, "POST", base, object{"kind": "text", "request_id": "property-create"}, 201)
	if d["id"] != replay["id"] {
		t.Fatal("duplicate definition")
	}
	id := d["id"].(string)
	d = req(t, h, "PATCH", "/property-definitions/"+id, object{"version": d["version"], "name": "备注"}, 200)
	fields := func(typ string, o object) object {
		return req(t, h, "GET", "/objects/"+typ+"/"+o["id"].(string)+"/custom-properties", nil, 200)
	}
	for _, o := range []object{a, b, makeObject(pid, "pages")} {
		f := fields("pages", o)["fields"].([]any)
		if len(f) != 1 || f[0].(map[string]any)["value"] != nil {
			t.Fatal(f)
		}
	}
	for _, entry := range []struct {
		typ string
		o   object
	}{{"tasks", task}, {"pages", foreign}} {
		if len(fields(entry.typ, entry.o)["fields"].([]any)) != 0 {
			t.Fatal("scope leaked")
		}
	}
	path := "/objects/pages/" + a["id"].(string) + "/custom-properties/" + id
	in := object{"version": 0, "definition_version": d["version"], "value": "自己的备注"}
	req(t, h, "PUT", path, in, 200)
	req(t, h, "PUT", path, in, 409)
	req(t, h, "PUT", "/objects/tasks/"+task["id"].(string)+"/custom-properties/"+id, in, 409)
	req(t, h, "PUT", "/objects/pages/"+foreign["id"].(string)+"/custom-properties/"+id, in, 409)
	got := req(t, h, "GET", "/pages/"+a["id"].(string), nil, 200)
	if got["version"] != a["version"] {
		t.Fatal("custom value changed body version")
	}
	got = req(t, h, "GET", "/objects/pages/"+a["id"].(string), nil, 200)
	if got["custom_properties"].([]any)[0].(map[string]any)["value"] != "自己的备注" {
		t.Fatal(got)
	}
	req(t, h, "PUT", path, object{"version": 1, "definition_version": d["version"], "value": nil}, 200)
	req(t, h, "POST", base, object{"kind": "text", "name": "备注"}, 409)
	req(t, h, "PATCH", "/property-definitions/"+id, object{"version": 1, "name": "旧版本"}, 409)
	req(t, h, "PATCH", "/property-definitions/"+id, object{"version": d["version"], "kind": "url"}, 400)
}

func TestCustomPropertyChoiceAndURLValidation(t *testing.T) {
	h, closeDB := setup(t)
	defer closeDB()
	p := req(t, h, "POST", "/projects", object{"title": "Choices"}, 201)
	pid := p["id"].(string)
	n := req(t, h, "POST", "/projects/"+pid+"/pages", object{"title": "Note"}, 201)
	for _, kind := range []string{"single_select", "multi_select", "url", "text"} {
		t.Run(kind, func(t *testing.T) {
			d := req(t, h, "POST", "/projects/"+pid+"/property-definitions/pages", object{"kind": kind}, 201)
			id := d["id"].(string)
			if kind == "single_select" || kind == "multi_select" {
				d = req(t, h, "PATCH", "/property-definitions/"+id, object{"version": 1, "options": []object{{"id": "o1", "name": "一"}, {"id": "o2", "name": "二"}}}, 200)
			}
			path := "/objects/pages/" + n["id"].(string) + "/custom-properties/" + id
			put := func(v any, version int, status int) object {
				return req(t, h, "PUT", path, object{"version": version, "definition_version": d["version"], "value": v}, status)
			}
			switch kind {
			case "single_select":
				put("missing", 0, 400)
				put([]string{"o1"}, 0, 400)
				put("o1", 0, 200)
			case "multi_select":
				put([]string{"o1", "o1"}, 0, 400)
				put([]string{"missing"}, 0, 400)
				put("o1", 0, 400)
				put([]string{"o1", "o2"}, 0, 200)
			case "url":
				for _, v := range []string{"javascript:alert(1)", "https://", "file:///etc/passwd"} {
					put(v, 0, 400)
				}
				put("https://example.com/path?q=1", 0, 200)
			case "text":
				put(123, 0, 400)
				put("正常\n文本", 0, 200)
			}
			if kind == "single_select" || kind == "multi_select" {
				req(t, h, "PATCH", "/property-definitions/"+id, object{"version": d["version"], "options": []object{{"id": "o2", "name": "二"}}}, 400)
				d = req(t, h, "PATCH", "/property-definitions/"+id, object{"version": d["version"], "options": []object{{"id": "o1", "name": "重命名"}, {"id": "o2", "name": "二"}}}, 200)
				put(nil, 1, 200)
			}
		})
	}
}

func TestCustomPropertiesArchiveDeleteAndRestore(t *testing.T) {
	h, closeDB := setup(t)
	defer closeDB()
	p := req(t, h, "POST", "/projects", object{"title": "Retention"}, 201)
	pid := p["id"].(string)
	n := req(t, h, "POST", "/projects/"+pid+"/pages", object{"title": "Note"}, 201)
	nid := n["id"].(string)
	d := req(t, h, "POST", "/projects/"+pid+"/property-definitions/pages", object{"kind": "text"}, 201)
	did := d["id"].(string)
	valuePath := "/objects/pages/" + nid + "/custom-properties/" + did
	preview := req(t, h, "GET", "/pages/"+nid+"/delete-preview", nil, 200)
	req(t, h, "PUT", valuePath, object{"version": 0, "definition_version": 1, "value": "恢复后仍在"}, 200)
	req(t, h, "DELETE", "/pages/"+nid, preview, 409)
	preview = req(t, h, "GET", "/pages/"+nid+"/delete-preview", nil, 200)
	deleted := req(t, h, "DELETE", "/pages/"+nid, preview, 200)
	req(t, h, "GET", "/objects/pages/"+nid+"/custom-properties", nil, 404)
	req(t, h, "POST", "/trash/"+deleted["batch_id"].(string)+"/restore", nil, 200)
	fields := req(t, h, "GET", "/objects/pages/"+nid+"/custom-properties", nil, 200)["fields"].([]any)
	if fields[0].(map[string]any)["value"] != "恢复后仍在" {
		t.Fatal(fields)
	}
	req(t, h, "PATCH", "/projects/"+pid, object{"version": p["version"], "archived": true}, 200)
	req(t, h, "PUT", valuePath, object{"version": 1, "definition_version": 1, "value": "禁止"}, 409)
	req(t, h, "PATCH", "/property-definitions/"+did, object{"version": 1, "name": "禁止"}, 409)
	req(t, h, "POST", "/projects/"+pid+"/property-definitions/pages", object{"kind": "url"}, 409)
}

func TestDefinitionChangeInvalidatesEmptyProjectPreview(t *testing.T) {
	h, closeDB := setup(t)
	defer closeDB()
	p := req(t, h, "POST", "/projects", object{"title": "Empty project"}, 201)
	pid := p["id"].(string)
	before := req(t, h, "GET", "/projects/"+pid+"/delete-preview", nil, 200)
	req(t, h, "POST", "/projects/"+pid+"/property-definitions/pages", object{"kind": "text"}, 201)
	req(t, h, "DELETE", "/projects/"+pid, before, 409)
}

func TestCustomPropertyDeleteHTTPContracts(t *testing.T) {
	h, closeDB := setup(t)
	defer closeDB()
	p := req(t, h, "POST", "/projects", object{"title": "Delete properties"}, 201)
	pid := p["id"].(string)
	n := req(t, h, "POST", "/projects/"+pid+"/pages", object{"title": "N"}, 201)
	d := req(t, h, "POST", "/projects/"+pid+"/property-definitions/pages", object{"kind": "single_select"}, 201)
	path := "/property-definitions/" + d["id"].(string)
	req(t, h, "DELETE", path, object{"version": 1, "unexpected": true}, 400)
	req(t, h, "DELETE", "/property-definitions/title", object{"version": 1}, 404)
	d = req(t, h, "PATCH", path, object{"version": 1, "options": []object{{"id": "a", "name": "A"}, {"id": "b", "name": "B"}}}, 200)
	req(t, h, "PUT", "/objects/pages/"+n["id"].(string)+"/custom-properties/"+d["id"].(string), object{"version": 0, "definition_version": 2, "value": "a"}, 200)
	req(t, h, "DELETE", path+"/options/a", object{"version": 1}, 409)
	req(t, h, "DELETE", path+"/options/missing", object{"version": 2}, 404)
	d = req(t, h, "DELETE", path+"/options/a", object{"version": 2}, 200)
	if d["version"] != float64(3) || len(d["options"].([]any)) != 1 {
		t.Fatal(d)
	}
	fields := req(t, h, "GET", "/objects/pages/"+n["id"].(string)+"/custom-properties", nil, 200)["fields"].([]any)
	f := fields[0].(map[string]any)
	if f["value"] != nil || f["version"] != float64(2) {
		t.Fatal(f)
	}
	got := req(t, h, "GET", "/pages/"+n["id"].(string), nil, 200)
	if got["version"] != n["version"] {
		t.Fatal("body version changed")
	}
	req(t, h, "PATCH", "/projects/"+pid, object{"version": p["version"], "archived": true}, 200)
	req(t, h, "DELETE", path, object{"version": 3}, 409)
	req(t, h, "DELETE", path+"/options/b", object{"version": 3}, 409)
	// A second project exercises successful definition deletion and its response.
	p2 := req(t, h, "POST", "/projects", object{"title": "Writable"}, 201)
	d2 := req(t, h, "POST", "/projects/"+p2["id"].(string)+"/property-definitions/tasks", object{"kind": "text"}, 201)
	path2 := "/property-definitions/" + d2["id"].(string)
	req(t, h, "DELETE", path2, object{"version": 0}, 409)
	result := req(t, h, "DELETE", path2, object{"version": 1}, 200)
	if result["deleted"] != true {
		t.Fatal(result)
	}
	req(t, h, "DELETE", path2, object{"version": 1}, 404)
}
