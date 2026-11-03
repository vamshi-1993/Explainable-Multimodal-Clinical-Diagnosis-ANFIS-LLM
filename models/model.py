import torch, torch.nn as nn, torch.nn.functional as F
import itertools
from torchvision import models

class ANFIS(nn.Module):
    def __init__(self, n_params, n_sets, n_classes, sigma=0.25):
        super().__init__()
        self.n_params, self.n_sets, self.n_classes = n_params, n_sets, n_classes
        c = torch.linspace(0, 1, n_sets).repeat(n_params, 1)
        self.centres = nn.Parameter(c.clone())
        self.log_sigma = nn.Parameter(torch.full((n_params, n_sets), float(torch.log(torch.tensor(sigma)))))
        combos = torch.tensor(list(itertools.product(range(n_sets), repeat=n_params)))
        self.register_buffer("combos", combos)
        self.n_rules = combos.shape[0]
        self.consequent = nn.Parameter(torch.zeros(self.n_rules, n_classes))
        nn.init.normal_(self.consequent, std=0.1)

    def memberships(self, p):
        c = self.centres.clamp(-0.05, 1.05)
        d = p.unsqueeze(-1) - c
        return torch.exp(-0.5 * (d / self.log_sigma.exp().clamp(0.08, 0.5)) ** 2)

    def forward(self, p):
        mu = self.memberships(p)
        sel = mu.unsqueeze(1).expand(-1, self.n_rules, -1, -1)
        idx = self.combos.view(1, self.n_rules, self.n_params, 1).expand(sel.size(0), -1, -1, -1)
        w = sel.gather(3, idx).squeeze(-1)
        fire = w.clamp_min(1e-8).log().sum(-1)
        w_norm = F.softmax(fire, dim=1)
        logits = w_norm @ self.consequent
        return logits, w_norm

    def rule_text(self, rule_id, param_names, set_names, class_names):
        sets = self.combos[rule_id].tolist()
        conds = " AND ".join(f"{param_names[i]} is {set_names[s]}" for i, s in enumerate(sets))
        cls = class_names[int(self.consequent[rule_id].argmax())]
        return f"IF {conds} THEN {cls}"


class ClinicalModel(nn.Module):
    def __init__(self, n_classes, n_params=4, n_sets=3, with_segmentation=True):
        super().__init__()
        base = models.resnet18(weights=None)
        self.stem = nn.Sequential(base.conv1, base.bn1, base.relu, base.maxpool)
        self.layer1, self.layer2, self.layer3, self.layer4 = base.layer1, base.layer2, base.layer3, base.layer4
        self.pool = base.avgpool
        self.bottleneck = nn.Linear(512, n_params)
        self.anfis = ANFIS(n_params=n_params, n_sets=n_sets, n_classes=n_classes)
        self.with_segmentation = with_segmentation
        if with_segmentation:
            self.decoder = nn.Sequential(
                nn.ConvTranspose2d(512, 128, 4, stride=2, padding=1), nn.ReLU(),
                nn.ConvTranspose2d(128, 64, 4, stride=2, padding=1), nn.ReLU(),
                nn.ConvTranspose2d(64, 32, 4, stride=2, padding=1), nn.ReLU(),
                nn.ConvTranspose2d(32, 16, 4, stride=2, padding=1), nn.ReLU(),
                nn.ConvTranspose2d(16, 1, 4, stride=2, padding=1),
            )

    def forward(self, x):
        f = self.layer4(self.layer3(self.layer2(self.layer1(self.stem(x)))))
        pooled = self.pool(f).flatten(1)
        p = torch.sigmoid(self.bottleneck(pooled))
        logits, w = self.anfis(p)
        seg = self.decoder(f) if self.with_segmentation else None
        return logits, p, w, seg


def load_model(weights_path, device="cpu"):
    ckpt = torch.load(weights_path, map_location=device)
    model = ClinicalModel(
        n_classes=len(ckpt["classes"]),
        n_params=len(ckpt["params"]),
        with_segmentation="decoder.0.weight" in ckpt["state_dict"],
    )
    model.load_state_dict(ckpt["state_dict"])
    model.eval()
    return model, ckpt["classes"], ckpt["params"]
